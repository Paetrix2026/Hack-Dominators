from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPBearer

from app.schemas.batch_schema import BatchCreate
from app.schemas.request_schema import HerbRequestCreate, HerbRequestResponse

# 🔐 AUTH
from app.dependencies.auth import get_current_user

# 🔗 SERVICES
from app.services.ai_service import analyze_herb
from app.services.trust_service import calculate_trust
from app.services.blockchain_service import generate_hash, store_on_blockchain
from app.services.qr_service import generate_qr
from app.services.geo_service import validate_geo
from app.services.fraud_service import detect_fraud

# 💾 DATABASE
from app.database import batch_collection, herb_request_collection

from bson import ObjectId
from bson.errors import InvalidId

router = APIRouter(prefix="/batch", tags=["Batch"])


def _mongo_doc_jsonable(doc: dict) -> dict:
    """BSON → plain dict so FastAPI returns JSON (raw Mongo docs otherwise cause 500)."""

    def conv(v):
        if v is None or isinstance(v, (str, int, float, bool)):
            return v
        if isinstance(v, ObjectId):
            return str(v)
        if isinstance(v, datetime):
            return v.isoformat()
        if isinstance(v, dict):
            return {k: conv(x) for k, x in v.items()}
        if isinstance(v, list):
            return [conv(x) for x in v]
        return str(v)

    return conv(doc)

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
    photos: list[UploadFile] = File(default=[]),
    user=Depends(get_current_user),
    token=Depends(security)
):
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

    # 🤖 AI
    ai_result = analyze_herb()
    resolved_herb = (batch.herb_name or ai_result.get("herb") or "").strip() or "Unknown"

    # 🌍 GEO
    geo_result = validate_geo(resolved_herb, batch.location)

    # ⚠️ FRAUD
    base_data = {
        "farmer_name": batch.farmer_name,
        "herb_name": resolved_herb,
        "quantity": batch.quantity,
        "location": batch.location
    }

    fraud_result = detect_fraud(base_data)

    # 📸 PHOTO QUALITY SIGNAL (simple weighted boost)
    photo_score = min(100, 55 + (len(photos) * 7))
    blended_quality = int((ai_result["quality_score"] * 0.6) + (photo_score * 0.4))

    # ⭐ TRUST
    trust_score = calculate_trust(
        blended_quality,
        geo_result["geo_score"],
        fraud_result["fraud_score"]
    )
    grade = trust_grade(trust_score)
    certificate_id = f"CERT-{uuid4().hex[:8].upper()}"

    # 🧾 FINAL DATA
    data = {
        "farmer_name": batch.farmer_name,
        "herb_name": resolved_herb,
        "quantity": batch.quantity,
        "location": batch.location,

        # 🌍 GEO
        "geo_valid": geo_result["geo_valid"],
        "geo_score": geo_result["geo_score"],
        "geo_message": geo_result["message"],

        # 🤖 AI
        "quality_score": blended_quality,
        "ai_quality_score": ai_result["quality_score"],
        "photo_quality_score": photo_score,
        "photo_count": len(photos),
        "photos": [p.filename for p in photos if p.filename],

        # ⚠️ FRAUD
        "fraud_score": fraud_result["fraud_score"],
        "fraud_risk": fraud_result["fraud_risk"],

        # ⭐ TRUST
        "trust_score": trust_score,
        "trust_grade": grade,
        "trust_certificate": {
            "certificate_id": certificate_id,
            "issued_at": datetime.utcnow().isoformat(),
            "issued_to": batch.farmer_name,
            "grade": grade,
            "trust_score": trust_score,
        },

        # 🏭 STAGE (NEW 🔥)
        "stage": "Collected",

        # 🔐 USER
        "created_by": user_id,
        "user_email": user_email
    }

    # 🔐 HASH
    hash_val = generate_hash(data)

    # 🔗 BLOCKCHAIN
    tx_hash = store_on_blockchain(hash_val)

    data["blockchain_hash"] = hash_val
    data["tx_hash"] = tx_hash

    # 💾 SAVE
    result = batch_collection.insert_one(data)

    batch_id = str(result.inserted_id)
    data["_id"] = batch_id

    # 📦 QR
    qr_path = generate_qr(batch_id)
    data["qr_code"] = qr_path

    return {
        "message": "Batch created successfully",
        "data": data
    }


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
        oid = ObjectId(batch_id)
    except (InvalidId, TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid batch id")
    batch = batch_collection.find_one({"_id": oid})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return _mongo_doc_jsonable(batch)


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

    return _mongo_doc_jsonable(batch)


# 🟢 UPDATE STAGE (🔥 MANUFACTURER)
@router.post("/update-stage")
def update_stage(
    batch_id: str,
    new_stage: str,
    user=Depends(get_current_user),
    token=Depends(security)
):

    # 🔒 Role check
    if user.get("role") != "manufacturer":
        return {"error": "Only manufacturer can update stage"}

    if new_stage not in VALID_STAGES:
        return {"error": "Invalid stage"}

    batch = batch_collection.find_one({"_id": ObjectId(batch_id)})

    if not batch:
        return {"error": "Batch not found"}

    batch_collection.update_one(
        {"_id": ObjectId(batch_id)},
        {"$set": {"stage": new_stage}}
    )

    return {
        "message": "Stage updated successfully",
        "batch_id": batch_id,
        "new_stage": new_stage
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

            <h2 class="highlight">👨‍🌾 Farmer: {batch['farmer_name']}</h2>
            <h3>🌿 Herb: {batch['herb_name']}</h3>
            <h3>📦 Quantity: {batch['quantity']}</h3>
            <h3>📍 Location: {batch['location']}</h3>
            <h2>🏭 Stage: {batch.get("stage","Collected")}</h2>

            <hr>

            <h2>📊 Quality Score: {batch['quality_score']}</h2>
            <h2>⚠️ Fraud Risk: {batch['fraud_risk']} (Score: {batch.get('fraud_score',0)})</h2>

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