import json
import logging
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from bson import json_util
from fastapi import APIRouter, Body, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPBearer

from app.schemas.batch_schema import BatchCreate
from app.schemas.request_schema import HerbRequestCreate, HerbRequestResponse

# 🔐 AUTH
from app.dependencies.auth import get_current_user

# 🔗 SERVICES
from app.services.ai_service import analyze_herb
from app.services.plant_classifier_service import is_explicit_non_plant, validate_is_plant_image
from app.services.trust_service import calculate_trust
from app.services.blockchain_service import generate_hash, store_on_blockchain
from app.services.qr_service import generate_qr
from app.services.geo_service import validate_geo
from app.services.fraud_service import detect_fraud
from app.services.herb_model_service import classify_herb_image, get_model_status, is_model_available
from app.services.herb_quality_model_service import (
    classify_image_quality,
    get_quality_model_status,
    is_quality_model_available,
)

# 💾 DATABASE
from app.database import batch_collection, herb_request_collection

from bson import ObjectId
from bson.errors import InvalidId
from pymongo.errors import PyMongoError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/batch", tags=["Batch"])
public_router = APIRouter(tags=["Batch Public APIs"])
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploaded_photos"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _flatten_extended_json(obj):
    """Turn Mongo extended JSON ($oid, $date, …) into plain JSON-safe values."""
    if isinstance(obj, dict):
        keys = set(obj.keys())
        if keys == {"$oid"}:
            return obj["$oid"]
        if keys == {"$date"}:
            d = obj["$date"]
            return d if isinstance(d, str) else str(d)
        if keys == {"$numberDecimal"}:
            return obj["$numberDecimal"]
        if keys == {"$numberLong"}:
            return int(obj["$numberLong"])
        if keys == {"$numberDouble"}:
            return float(obj["$numberDouble"])
        return {k: _flatten_extended_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_flatten_extended_json(x) for x in obj]
    return obj


def _mongo_doc_jsonable(doc: dict) -> dict:
    """BSON document → dict FastAPI can serialize (avoids 500 on nested ObjectId/datetime)."""
    raw = json.loads(json_util.dumps(doc))
    return _flatten_extended_json(raw)

# 🔐 SECURITY
security = HTTPBearer()

# 🏭 VALID STAGES
VALID_STAGES = [
    "Collected",
    "Processed",
    "Manufactured",
    "Packaged",
    "Ready"
]
VALID_COMPLIANCE_STATUSES = ["PASS", "FAIL"]


def _advanced_trust_score(quality_score: int, geo_valid: bool, fraud_flag: bool, compliance_status: str) -> int:
    quality = max(0, min(int(quality_score or 0), 100))
    score = (quality * 0.4) + (20 if geo_valid else 0) + (0 if fraud_flag else 20) + (20 if compliance_status == "PASS" else 0)
    return int(round(max(0, min(score, 100))))


def _is_manufacturer(user: dict, client_role: str | None = None) -> bool:
    values = [
        user.get("role"),
        user.get("user_role"),
        user.get("custom_role"),
        client_role,
    ]
    for value in values:
        if isinstance(value, str) and "manufacturer" in value.strip().lower():
            return True
    return False


def _rehash_medicine_if_needed(batch: dict) -> dict:
    if (batch.get("type") or "").strip().lower() != "medicine":
        return batch
    tx_hash = (batch.get("tx_hash") or "").strip().lower()
    if tx_hash and tx_hash not in {"dummy_hash"}:
        return batch

    hash_input = {
        "product_name": batch.get("product_name"),
        "source_batch_ids": batch.get("source_batch_ids", []),
        "composition": batch.get("composition", []),
        "quality_score": batch.get("quality_score", 0),
        "trust_score": batch.get("trust_score", 0),
    }
    blockchain_hash = generate_hash(hash_input)
    fresh_tx = store_on_blockchain(blockchain_hash)
    final_tx = fresh_tx if fresh_tx and fresh_tx != "failed" else "failed"

    batch_collection.update_one(
        {"_id": batch["_id"]},
        {"$set": {"blockchain_hash": blockchain_hash, "tx_hash": final_tx, "reanchored_at": datetime.utcnow().isoformat()}},
    )
    batch["blockchain_hash"] = blockchain_hash
    batch["tx_hash"] = final_tx
    return batch


def trust_grade(score: int) -> str:
    if score >= 90:
        return "A+"
    if score >= 80:
        return "A"
    if score >= 70:
        return "B"
    if score >= 60:
        return "C"
    return "D"


# 🟢 CREATE BATCH
@router.post("/upload")
def upload_batch(
    farmer_name: str = Form(...),
    herb_name: str = Form(""),
    quantity: int = Form(...),
    location: str = Form(...),
    items: str = Form(""),
    photos: list[UploadFile] = File(default=[]),
    user=Depends(get_current_user),
    token=Depends(security)
):
    try:
        if len(photos) > 6:
            raise HTTPException(status_code=400, detail="You can upload up to 6 photos only")

        batch = BatchCreate(
            farmer_name=farmer_name,
            herb_name=herb_name.strip() or None,
            quantity=quantity,
            location=location
        )

        user_id = user.get("uid")
        user_email = user.get("email")

        photo_entries = []
        photo_contents: list[tuple[bytes, str]] = []  # (bytes, mime_type) per photo
        for photo in photos:
            safe_name = (photo.filename or f"photo-{uuid4().hex[:8]}").replace(" ", "_")
            final_name = f"{uuid4().hex[:10]}-{safe_name}"
            file_path = UPLOAD_DIR / final_name
            content = photo.file.read()
            photo_contents.append((content, photo.content_type or "image/jpeg"))
            with open(file_path, "wb") as f:
                f.write(content)
            photo_entries.append(
                {
                    "original_name": photo.filename or final_name,
                    "stored_name": final_name,
                    "url": f"/api/uploads/{final_name}",
                }
            )

        # 🌿 PLANT / HERB IMAGE VALIDATION GATE
        # 1) Always require plant/herb image (Gemini or heuristic) — blocks people, objects, selfies.
        # 2) Then local Keras herb classifier (if present) for species + confidence.
        invalid_photos = []
        detected = []
        quality_preds = []
        for idx, ((img_bytes, mime_type), photo) in enumerate(zip(photo_contents, photos)):
            try:
                qpred_for_photo = None
                # Optional quality gate (only if quality model is available).
                # Fail-open: if model fails, we continue with existing flow.
                if is_quality_model_available():
                    qpred = classify_image_quality(img_bytes)
                    qpred_for_photo = qpred if qpred.get("ok") else None

                # Strict plant gate FIRST (herb model alone can misclassify faces as a herb class)
                try:
                    clf = validate_is_plant_image(img_bytes, mime_type)
                except ValueError as ve:
                    invalid_photos.append(
                        {
                            "index": idx,
                            "filename": photo.filename or f"photo-{idx + 1}",
                            "reason": str(ve),
                        }
                    )
                    detected.append(None)
                    quality_preds.append(qpred_for_photo)
                    continue
                if is_explicit_non_plant(clf.get("is_plant")):
                    invalid_photos.append(
                        {
                            "index": idx,
                            "filename": photo.filename or f"photo-{idx + 1}",
                            "reason": clf.get("reason", "Not a plant or herb image. Upload only herbs, leaves, or botanical material."),
                        }
                    )
                    detected.append(None)
                    quality_preds.append(qpred_for_photo)
                    continue

                if is_model_available():
                    pred = classify_herb_image(img_bytes)
                    if not pred.get("ok", False):
                        detected.append(None)
                        quality_preds.append(qpred_for_photo)
                        continue
                    label = pred.get("label")
                    conf = float(pred.get("confidence") or 0.0)
                    if not label or conf < 0.60:
                        invalid_photos.append(
                            {
                                "index": idx,
                                "filename": photo.filename or f"photo-{idx + 1}",
                                "reason": f"Not confidently a supported herb (confidence {conf:.2f}).",
                            }
                        )
                        detected.append(None)
                    else:
                        detected.append(label)
                else:
                    detected.append(None)
                quality_preds.append(qpred_for_photo)
            except ValueError as ve:
                # Unsupported file type or file too large — hard reject
                invalid_photos.append({
                    "index": idx,
                    "filename": photo.filename or f"photo-{idx + 1}",
                    "reason": str(ve),
                })
                detected.append(None)
                quality_preds.append(None)
            except Exception as exc:
                # Classifier error — fail open (log, allow through)
                logger.warning("Plant gate / classifier error on photo %s: %s", idx, exc)
                detected.append(None)
                quality_preds.append(None)

        if invalid_photos:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "INVALID_IMAGE",
                    "message": "One or more uploaded images are not plant or herb photos. "
                               "Please upload only photos of plants, herbs, leaves, roots, "
                               "or other Ayurvedic botanicals.",
                    "invalid_photos": invalid_photos,
                },
            )

        # Attach detected herb (if any) to photo_entries for downstream usage.
        if detected:
            for idx, herb in enumerate(detected):
                if herb and idx < len(photo_entries):
                    photo_entries[idx]["detected_herb"] = herb
                    # keep minimal debug info for client troubleshooting
                    photo_entries[idx]["detected_confidence"] = None
                    photo_entries[idx]["detected_probs"] = None

        # If model is available, attach full prediction debug for transparency.
        if is_model_available():
            for idx, ((img_bytes, _mime), _photo) in enumerate(zip(photo_contents, photos)):
                if idx >= len(photo_entries):
                    continue
                pred = classify_herb_image(img_bytes)
                if pred.get("ok"):
                    photo_entries[idx]["detected_herb"] = pred.get("label")
                    photo_entries[idx]["detected_confidence"] = pred.get("confidence")
                    # store only top-3 probs to keep payload small
                    probs = pred.get("probs") or {}
                    top = sorted(probs.items(), key=lambda kv: kv[1], reverse=True)[:3]
                    photo_entries[idx]["detected_top3"] = [{"label": k, "p": v} for k, v in top]
                else:
                    photo_entries[idx]["detected_herb"] = None
                    photo_entries[idx]["detected_confidence"] = None
                    photo_entries[idx]["detected_top3"] = None

        # Attach quality prediction info (if quality model is available).
        if is_quality_model_available():
            for idx, qpred in enumerate(quality_preds):
                if idx >= len(photo_entries):
                    continue
                if not qpred:
                    photo_entries[idx]["image_quality"] = None
                    photo_entries[idx]["image_quality_confidence"] = None
                    continue
                photo_entries[idx]["image_quality"] = qpred.get("quality")
                photo_entries[idx]["image_quality_confidence"] = qpred.get("confidence")

        parsed_items = []
        if items.strip():
            try:
                incoming_items = json.loads(items)
                if not isinstance(incoming_items, list):
                    raise ValueError("items must be a list")
                for item in incoming_items:
                    if not isinstance(item, dict):
                        continue
                    parsed_items.append(
                        {
                            "herb_name": str(item.get("herb_name", "")).strip(),
                            "quantity": int(item.get("quantity", 0)),
                            "notes": str(item.get("notes", "")).strip(),
                            "photo_index": int(item.get("photo_index", -1)),
                        }
                    )
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid items payload: {e}") from e

        if not parsed_items:
            parsed_items = [
                {
                    "herb_name": batch.herb_name or "",
                    "quantity": batch.quantity,
                    "notes": "",
                    "photo_index": 0 if photos else -1,
                }
            ]

        herb_items = []
        for idx, item in enumerate(parsed_items):
            photo_index = item.get("photo_index", -1)
            photo_meta = photo_entries[photo_index] if 0 <= photo_index < len(photo_entries) else None
            claimed_item_herb = (item.get("herb_name") or "").strip() or batch.herb_name

            try:
                ai_result = analyze_herb(
                    claimed_item_herb,
                    photo_meta.get("original_name") if photo_meta else None,
                )
            except Exception as e:
                print(f"❌ AI Service Error (item {idx}): {e}")
                ai_result = {
                    "herb": claimed_item_herb,
                    "quality_score": 52,
                    "match": False,
                    "verified": False,
                }

            # If local ML model detected a herb, prefer it as the resolved herb.
            detected_herb = (photo_meta or {}).get("detected_herb")
            if detected_herb:
                ai_result["herb"] = detected_herb
                ai_result["verified"] = True
                if claimed_item_herb:
                    ai_result["match"] = str(claimed_item_herb).strip().lower() == str(detected_herb).strip().lower()

            resolved_item_herb = ai_result.get("herb") or claimed_item_herb or "Unknown"
            item_match = ai_result.get("match")

            herb_items.append(
                {
                    "index": idx,
                    "claimed_herb": claimed_item_herb,
                    "resolved_herb": resolved_item_herb,
                    "quantity": item.get("quantity") or 0,
                    "notes": item.get("notes") or "",
                    "photo_index": photo_index,
                    "photo_url": photo_meta.get("url") if photo_meta else "",
                    "photo_name": photo_meta.get("original_name") if photo_meta else "",
                    "detected_herb": (photo_meta or {}).get("detected_herb"),
                    "detected_confidence": (photo_meta or {}).get("detected_confidence"),
                    "detected_top3": (photo_meta or {}).get("detected_top3"),
                    "quality_score": ai_result.get("quality_score", 52),
                    "verification_match": item_match,
                    "verified": bool(ai_result.get("verified", False)),
                }
            )

        resolved_herb = herb_items[0]["resolved_herb"] if herb_items else (batch.herb_name or "Unknown")
        if herb_items and any(item.get("verification_match") is False for item in herb_items):
            verification_match = False
        elif herb_items and all(item.get("verification_match") is True for item in herb_items):
            verification_match = True
        else:
            verification_match = None
        avg_item_quality = int(sum(item.get("quality_score", 0) for item in herb_items) / max(1, len(herb_items)))

        # 🌍 GEO
        try:
            geo_result = validate_geo(resolved_herb, batch.location)
        except Exception as e:
            print(f"❌ Geo Service Error: {e}")
            geo_result = {"geo_valid": False, "geo_score": 50, "message": "Location validation failed"}

        # ⚠️ FRAUD
        base_data = {
            "farmer_name": batch.farmer_name,
            "herb_name": resolved_herb,
            "quantity": batch.quantity,
            "location": batch.location
        }

        try:
            fraud_result = detect_fraud(base_data)
        except Exception as e:
            print(f"❌ Fraud Service Error: {e}")
            fraud_result = {"fraud_score": 10, "fraud_risk": "Low"}

        # 📸 PHOTO QUALITY SIGNAL
        photo_score = min(100, 55 + (len(photos) * 7))
        blended_quality = int((avg_item_quality * 0.6) + (photo_score * 0.4))

        # ⭐ TRUST
        legacy_trust_score = calculate_trust(
            blended_quality,
            geo_result.get("geo_score", 50),
            fraud_result.get("fraud_score", 10)
        )
        if verification_match is False:
            legacy_trust_score = min(legacy_trust_score, 55)
        fraud_flag = str(fraud_result.get("fraud_risk", "")).lower() == "high"
        compliance_status = "PASS"
        trust_score = _advanced_trust_score(
            blended_quality,
            bool(geo_result.get("geo_valid", False)),
            fraud_flag,
            compliance_status,
        )
        grade = trust_grade(trust_score)
        certificate_id = f"CERT-{uuid4().hex[:8].upper()}"

        # 🧾 FINAL DATA
        data = {
            "farmer_name": batch.farmer_name,
            "herb": resolved_herb,
            "herb_name": resolved_herb,
            "claimed_herb": batch.herb_name,
            "verification_match": verification_match,
            "quantity": batch.quantity,
            "location": batch.location,
            "geo_valid": geo_result.get("geo_valid", False),
            "geo_score": geo_result.get("geo_score", 50),
            "geo_message": geo_result.get("message", ""),
            "quality_score": blended_quality,
            "ai_quality_score": avg_item_quality,
            "photo_quality_score": photo_score,
            "photo_count": len(photos),
            "photos": [p.filename for p in photos if p.filename],
            "photo_urls": [p["url"] for p in photo_entries],
            "herb_items": herb_items,
            "fraud_score": fraud_result.get("fraud_score", 10),
            "fraud_risk": fraud_result.get("fraud_risk", "Low"),
            "fraud_flag": fraud_flag,
            "compliance_status": compliance_status,
            "trust_score": trust_score,
            "legacy_trust_score": legacy_trust_score,
            "trust_grade": grade,
            "trust_certificate": {
                "certificate_id": certificate_id,
                "issued_at": datetime.utcnow().isoformat(),
                "issued_to": batch.farmer_name,
                "grade": grade,
                "trust_score": trust_score,
            },
            "stage": "Collected",
            "status": "collected",
            "type": "herb",
            "product_name": f"{resolved_herb} Medicine",
            "composition": [
                {
                    "herb": item.get("resolved_herb") or item.get("claimed_herb") or "Unknown",
                    "quantity": f"{item.get('quantity', 0)}mg",
                    "farmer": batch.farmer_name,
                    "location": batch.location,
                }
                for item in herb_items
            ],
            "dosage": "1-2 tablets daily",
            "warnings": ["Consult a physician before use"],
            "side_effects": [],
            "created_by": user_id,
            "user_email": user_email,
            "created_at": datetime.utcnow().isoformat()
        }

        # 🔐 HASH
        try:
            hash_val = generate_hash(data)
            data["blockchain_hash"] = hash_val
            
            # 🔗 BLOCKCHAIN
            tx_hash = store_on_blockchain(hash_val)
            data["tx_hash"] = tx_hash
        except Exception as e:
            print(f"❌ Blockchain/Hash Error: {e}")
            data["blockchain_hash"] = "N/A"
            data["tx_hash"] = "failed"

        # 💾 SAVE
        try:
            result = batch_collection.insert_one(data)
            batch_id = str(result.inserted_id)
            data["_id"] = batch_id
        except Exception as e:
            print(f"❌ Database Error: {e}")
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

        # 📦 QR
        try:
            qr_path = generate_qr(batch_id)
            data["qr_code"] = qr_path
        except Exception as e:
            print(f"❌ QR Generation Error: {e}")
            data["qr_code"] = ""

        return {
            "message": "Batch created successfully",
            "data": _mongo_doc_jsonable(data),
            "ml_status": {
                "herb_model": get_model_status(),
                "quality_model": get_quality_model_status(),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Unexpected Server Error: {e}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")


# 🟢 GET ALL
@router.get("/")
def get_all_batches(
    user=Depends(get_current_user),
    token=Depends(security)
):

    batches = []

    for batch in batch_collection.find().sort("_id", -1):
        batches.append(_mongo_doc_jsonable(batch))

    return {
        "count": len(batches),
        "data": batches
    }


# 🟢 GET SINGLE (public — consumer QR scan; no sign-in)
@router.get("/public/{batch_id}")
def get_batch_public(batch_id: str):
    try:
        try:
            oid = ObjectId(batch_id)
        except (InvalidId, TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid batch id")
        batch = batch_collection.find_one({"_id": oid})
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        batch = _rehash_medicine_if_needed(batch)
        return _mongo_doc_jsonable(batch)
    except HTTPException:
        raise
    except PyMongoError as e:
        raise HTTPException(
            status_code=503,
            detail=(
                "Cannot reach MongoDB. On Render open your Web Service → Environment → add "
                "MONGODB_URI with your MongoDB Atlas connection string (mongodb+srv://user:pass@cluster...). "
                "Redeploy after saving. "
                f"({e!s})"
            ),
        ) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {e!s}") from e


# 🟢 GET SINGLE (authenticated)
@router.get("/{batch_id}")
def get_batch(
    batch_id: str,
    user=Depends(get_current_user),
    token=Depends(security)
):
    try:
        oid = ObjectId(batch_id)
    except (InvalidId, TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid batch id")

    batch = batch_collection.find_one({"_id": oid})

    if not batch:
        return {"error": "Batch not found"}
    batch = _rehash_medicine_if_needed(batch)

    return _mongo_doc_jsonable(batch)


def _perform_stage_update(
    batch_id: str,
    new_stage: str,
    compliance_status: str,
    user: dict,
    x_user_role: str | None,
) -> dict:
    """Shared implementation for manufacturer stage updates (used by /batch/... and /update-stage/...)."""
    if not _is_manufacturer(user, x_user_role):
        return {"error": "Only manufacturer can update stage"}

    if new_stage not in VALID_STAGES:
        return {"error": "Invalid stage"}
    if compliance_status not in VALID_COMPLIANCE_STATUSES:
        return {"error": "Invalid compliance_status"}

    try:
        oid = ObjectId(batch_id)
    except (InvalidId, TypeError, ValueError):
        return {"error": "Invalid batch id"}

    batch = batch_collection.find_one({"_id": oid})

    if not batch:
        return {"error": "Batch not found"}

    trust_score = _advanced_trust_score(
        int(batch.get("quality_score", 0)),
        bool(batch.get("geo_valid", False)),
        bool(batch.get("fraud_flag", False)),
        compliance_status,
    )
    trust_grade_value = trust_grade(trust_score)

    batch_collection.update_one(
        {"_id": oid},
        {
            "$set": {
                "stage": new_stage,
                "compliance_status": compliance_status,
                "trust_score": trust_score,
                "trust_grade": trust_grade_value,
                "updated_at": datetime.utcnow().isoformat(),
            }
        },
    )

    return {
        "message": "Stage updated successfully",
        "batch_id": batch_id,
        "new_stage": new_stage,
        "compliance_status": compliance_status,
        "trust_score": trust_score,
        "trust_grade": trust_grade_value,
    }


# 🟢 UPDATE STAGE (🔥 MANUFACTURER)
@router.post("/update-stage/{batch_id}")
def update_stage(
    batch_id: str,
    new_stage: str = Body(..., embed=True),
    compliance_status: str = Body("PASS", embed=True),
    x_user_role: str | None = Header(default=None),
    user=Depends(get_current_user),
    token=Depends(security),
):
    return _perform_stage_update(batch_id, new_stage, compliance_status, user, x_user_role)


@public_router.post("/upload-batch")
def upload_batch_alias(
    farmer_name: str = Form(...),
    herb_name: str = Form(""),
    quantity: int = Form(...),
    location: str = Form(...),
    items: str = Form(""),
    photos: list[UploadFile] = File(default=[]),
    user=Depends(get_current_user),
    token=Depends(security),
):
    return upload_batch(farmer_name, herb_name, quantity, location, items, photos, user, token)


@public_router.post("/update-stage/{batch_id}")
def update_stage_alias(
    batch_id: str,
    payload: dict = Body(default={}),
    x_user_role: str | None = Header(default=None),
    user=Depends(get_current_user),
    token=Depends(security),
):
    new_stage = (payload.get("new_stage") or payload.get("stage") or "Collected").strip()
    compliance_status = (payload.get("compliance_status") or "PASS").strip()
    return _perform_stage_update(batch_id, new_stage, compliance_status, user, x_user_role)


@public_router.post("/report-side-effect/{batch_id}")
def report_side_effect(
    batch_id: str,
    payload: dict = Body(...),
):
    try:
        oid = ObjectId(batch_id)
    except (InvalidId, TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid batch id")

    batch = batch_collection.find_one({"_id": oid})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    symptoms = (payload.get("symptoms") or "").strip()
    severity = (payload.get("severity") or "").strip() or "Mild"
    if not symptoms:
        raise HTTPException(status_code=400, detail="symptoms is required")

    side_effect = {
        "symptoms": symptoms,
        "severity": severity,
        "timestamp": datetime.utcnow().isoformat(),
    }

    batch_collection.update_one(
        {"_id": oid},
        {"$push": {"side_effects": side_effect}},
    )

    return {"message": "Side effect reported successfully", "batch_id": batch_id, "data": side_effect}


@public_router.post("/create-medicine")
def create_medicine(
    payload: dict = Body(...),
    x_user_role: str | None = Header(default=None),
    user=Depends(get_current_user),
    token=Depends(security),
):
    if not _is_manufacturer(user, x_user_role):
        raise HTTPException(status_code=403, detail="Only manufacturer can create medicine")

    product_name = (payload.get("product_name") or "").strip()
    batch_ids = payload.get("batch_ids") or []

    if not product_name:
        raise HTTPException(status_code=400, detail="product_name is required")
    if not isinstance(batch_ids, list) or not batch_ids:
        raise HTTPException(status_code=400, detail="batch_ids must be a non-empty list")

    object_ids = []
    for bid in batch_ids:
        try:
            object_ids.append(ObjectId(str(bid)))
        except (InvalidId, TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"Invalid batch id: {bid}")

    selected_batches = list(
        batch_collection.find(
            {
                "_id": {"$in": object_ids},
                "$or": [{"type": "herb"}, {"type": {"$exists": False}}],
            }
        )
    )
    if not selected_batches:
        raise HTTPException(status_code=404, detail="No herb batches found for provided batch_ids")

    composition = []
    quality_scores = []
    source_batches = []
    for batch in selected_batches:
        herb_name = batch.get("herb_name") or batch.get("herb") or "Unknown Herb"
        qty = batch.get("quantity", 0)
        composition.append(
            {
                "herb": herb_name,
                "quantity": f"{qty}mg",
                "farmer": batch.get("farmer_name", "Unknown"),
                "location": batch.get("location", "Unknown"),
            }
        )
        quality_scores.append(int(batch.get("quality_score", 0)))
        source_batches.append(
            {
                "batch_id": str(batch.get("_id")),
                "herb_name": herb_name,
                "farmer_name": batch.get("farmer_name", "Unknown"),
                "location": batch.get("location", "Unknown"),
                "quantity": batch.get("quantity", 0),
                "quality_score": int(batch.get("quality_score", 0)),
            }
        )

    avg_quality = int(sum(quality_scores) / max(1, len(quality_scores)))
    trust_score = avg_quality

    hash_input = {
        "product_name": product_name,
        "source_batch_ids": [str(i) for i in object_ids],
        "composition": composition,
        "avg_quality": avg_quality,
        "trust_score": trust_score,
    }
    blockchain_hash = generate_hash(hash_input)
    try:
        tx_hash = store_on_blockchain(blockchain_hash)
    except Exception as e:
        print(f"❌ Blockchain Error (medicine): {e}")
        tx_hash = "failed"

    medicine_doc = {
        "product_name": product_name,
        "source_batch_ids": [str(i) for i in object_ids],
        "source_batches": source_batches,
        "composition": composition,
        "quality_score": avg_quality,
        "trust_score": trust_score,
        "stage": "Manufactured",
        "tx_hash": tx_hash,
        "qr_code": "",
        "type": "medicine",
        "blockchain_hash": blockchain_hash,
        "created_by": user.get("uid"),
        "created_at": datetime.utcnow().isoformat(),
    }

    result = batch_collection.insert_one(medicine_doc)
    medicine_id = str(result.inserted_id)
    qr_url_target = f"http://localhost:8000/batch/{medicine_id}"
    qr_code = generate_qr(medicine_id, url=qr_url_target)
    batch_collection.update_one({"_id": ObjectId(medicine_id)}, {"$set": {"qr_code": qr_code}})

    return {
        "message": "Medicine created successfully",
        "medicine_id": medicine_id,
        "qr_code": qr_code,
        "tx_hash": tx_hash,
        "blockchain_hash": blockchain_hash,
        "source_batch_values": source_batches,
    }


@router.get("/certificate/{batch_id}")
def get_certificate(
    batch_id: str,
    user=Depends(get_current_user),
    token=Depends(security)
):
    batch = batch_collection.find_one({"_id": ObjectId(batch_id)})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    cert = batch.get("trust_certificate")
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")

    return {
        "batch_id": batch_id,
        "farmer_name": batch.get("farmer_name"),
        "herb_name": batch.get("herb_name"),
        "trust_score": batch.get("trust_score"),
        "trust_grade": batch.get("trust_grade"),
        "certificate": cert,
    }


@router.post("/requests")
def create_herb_request(
    payload: HerbRequestCreate,
    user=Depends(get_current_user),
    token=Depends(security)
):
    request_doc = {
        "herb": payload.herb,
        "quantity": payload.quantity,
        "from_manufacturer_name": user.get("name") or user.get("email") or "Manufacturer",
        "from_manufacturer_email": user.get("email"),
        "to_farmer_name": payload.to_farmer_name,
        "to_farmer_email": payload.to_farmer_email,
        "status": "Pending",
        "request_date": datetime.utcnow().isoformat(),
    }
    result = herb_request_collection.insert_one(request_doc)
    request_doc["_id"] = str(result.inserted_id)
    return {"message": "Request sent", "data": request_doc}


@router.get("/requests/incoming")
def get_incoming_requests(
    user=Depends(get_current_user),
    token=Depends(security)
):
    user_email = user.get("email")
    user_name = user.get("name")
    q = {
        "$or": [
            {"to_farmer_email": user_email},
            {"to_farmer_name": user_name},
        ]
    }
    requests = []
    for req in herb_request_collection.find(q).sort("_id", -1):
        req["_id"] = str(req["_id"])
        requests.append(req)
    return {"count": len(requests), "data": requests}


@router.get("/requests/outgoing")
def get_outgoing_requests(
    user=Depends(get_current_user),
    token=Depends(security)
):
    user_email = user.get("email")
    user_name = user.get("name")
    q = {
        "$or": [
            {"from_manufacturer_email": user_email},
            {"from_manufacturer_name": user_name},
        ]
    }
    requests = []
    for req in herb_request_collection.find(q).sort("_id", -1):
        req["_id"] = str(req["_id"])
        requests.append(req)
    return {"count": len(requests), "data": requests}


@router.post("/requests/{request_id}/respond")
def respond_to_request(
    request_id: str,
    payload: HerbRequestResponse,
    user=Depends(get_current_user),
    token=Depends(security)
):
    decision = (payload.decision or "").capitalize()
    if decision not in ["Accepted", "Rejected"]:
        raise HTTPException(status_code=400, detail="Decision must be Accepted or Rejected")

    reason = (payload.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Reason is required")

    req = herb_request_collection.find_one({"_id": ObjectId(request_id)})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    user_email = user.get("email")
    user_name = user.get("name")
    if req.get("to_farmer_email") not in [None, user_email] and req.get("to_farmer_name") != user_name:
        raise HTTPException(status_code=403, detail="You are not allowed to respond to this request")

    herb_request_collection.update_one(
        {"_id": ObjectId(request_id)},
        {"$set": {"status": decision, "response_reason": reason, "responded_at": datetime.utcnow().isoformat()}}
    )
    return {"message": f"Request {decision.lower()} successfully", "request_id": request_id, "status": decision, "reason": reason}


# 🟢 PUBLIC VIEW
@router.get("/view/{batch_id}", response_class=HTMLResponse)
def view_batch(batch_id: str):

    batch = batch_collection.find_one({"_id": ObjectId(batch_id)})

    if not batch:
        return "<h2>Batch not found</h2>"

    batch["_id"] = str(batch["_id"])
    batch_type = (batch.get("type") or "herb").lower()
    farmer_name = batch.get("farmer_name") or "Multiple farmers"
    primary_herb = batch.get("herb_name") or (batch.get("composition") or [{}])[0].get("herb", "N/A")
    total_quantity = batch.get("quantity", 0)
    location = batch.get("location") or (batch.get("composition") or [{}])[0].get("location", "N/A")
    fraud_risk = batch.get("fraud_risk", "N/A")

    herb_items = batch.get("herb_items") or []
    if batch_type == "medicine" and batch.get("composition"):
        herb_items = [
            {
                "claimed_herb": item.get("herb", "-"),
                "resolved_herb": item.get("herb", "-"),
                "quantity": item.get("quantity", "-"),
                "notes": f"Farmer: {item.get('farmer', '-')}, Location: {item.get('location', '-')}",
                "verification_match": None,
            }
            for item in batch.get("composition", [])
        ]
    if herb_items:
        herb_items_html = ""
        for item in herb_items:
            status = item.get("verification_match")
            if status is True:
                status_text = "Matched"
                status_color = "#22c55e"
            elif status is False:
                status_text = "Mismatch"
                status_color = "#ef4444"
            else:
                status_text = "Unverified"
                status_color = "#f59e0b"

            photo_url = item.get("photo_url") or ""
            photo_html = (
                f'<img src="{photo_url}" alt="herb photo" '
                'style="width:120px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #333;margin-top:8px;" />'
                if photo_url
                else ""
            )
            herb_items_html += f"""
                <div style="background:#121212;border:1px solid #2a2a2a;border-radius:10px;padding:12px;margin-bottom:10px;">
                    <h3 style="margin:0 0 6px 0;">🌿 {item.get("claimed_herb","-")} → {item.get("resolved_herb","-")}</h3>
                    <p style="margin:4px 0;">📦 Qty: {item.get("quantity", 0)} kg</p>
                    <p style="margin:4px 0;color:{status_color};">🔎 Verification: {status_text}</p>
                    <p style="margin:4px 0;">📝 Notes: {item.get("notes","-") or "-"}</p>
                    {photo_html}
                </div>
            """
    else:
        herb_items_html = f"""
            <div style="background:#121212;border:1px solid #2a2a2a;border-radius:10px;padding:12px;">
                <h3>🌿 {batch.get("herb_name","-")}</h3>
                <p>📦 Qty: {batch.get("quantity", 0)} kg</p>
            </div>
        """

    return f"""
    <html>
    <head>
        <title>AyurTrust Verification</title>
        <style>
            body {{
                font-family: Arial;
                padding: 20px;
                background-color: #0D0D0D;
                color: white;
            }}
            .card {{
                background: #1A1A1A;
                padding: 20px;
                border-radius: 10px;
            }}
            .highlight {{
                color: #22D3EE;
            }}
            .trust {{
                font-size: 28px;
                color: #A855F7;
            }}
            .link {{
                color: #22D3EE;
                word-break: break-all;
            }}
        </style>
    </head>

    <body>

        <h1>🌿 AyurTrust Chain</h1>

        <div class="card">

            <h2 class="highlight">👨‍🌾 Farmer: {farmer_name}</h2>
            <h3>🌿 Primary Herb: {primary_herb}</h3>
            <h3>📦 Total Quantity: {total_quantity}</h3>
            <h3>📍 Location: {location}</h3>
            <h2>🏭 Stage: {batch.get("stage","Collected")}</h2>

            <hr>

            <h2>🧺 Herb Items</h2>
            {herb_items_html}

            <hr>

            <h2>📊 Quality Score: {batch['quality_score']}</h2>
            <h2>⚠️ Fraud Risk: {fraud_risk} (Score: {batch.get('fraud_score',0)})</h2>

            <h2>🌍 Geo Status: {"Valid" if batch.get("geo_valid") else "Suspicious"}</h2>
            <p>{batch.get("geo_message","")}</p>

            <h1 class="trust">⭐ Trust Score: {batch['trust_score']}</h1>

            <hr>

            <p>🔗 Blockchain Hash:</p>
            <small>{batch['blockchain_hash']}</small>

            <p>🧾 Transaction Hash:</p>
            <a class="link" href="https://amoy.polygonscan.com/tx/{batch.get('tx_hash','')}" target="_blank">
                {batch.get('tx_hash','N/A')}
            </a>

            <hr>

            <h2 style="color:lime;">✅ Verified Authentic Product</h2>

        </div>

    </body>
    </html>
    """