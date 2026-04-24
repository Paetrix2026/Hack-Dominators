from fastapi import APIRouter, UploadFile, File, Depends
import whisper
from pydantic import BaseModel
import re

# 🔐 AUTH
from app.dependencies.auth import get_current_user

# 🔗 SERVICES
from app.services.ai_service import analyze_herb
from app.services.geo_service import validate_geo
from app.services.fraud_service import detect_fraud
from app.services.trust_service import calculate_trust
from app.services.blockchain_service import generate_hash, store_on_blockchain
from app.services.qr_service import generate_qr

# 💾 DB
from app.database import batch_collection

router = APIRouter(prefix="/voice", tags=["Voice"])

model = whisper.load_model("base")


# 🔥 Kannada → English keyword map (common words)
# Note: speech-to-text often inserts extra words; we replace by substring, not token-equality.
MAP = {
    # Herbs
    "ಅಶ್ವಗಂಧ": "Ashwagandha",
    "ತುಳಸಿ": "Tulsi",
    "ಬೇವು": "Neem",          # Neem commonly said as "Bevu"
    "ನೀಮ್": "Neem",
    "ಬ್ರಾಹ್ಮಿ": "Brahmi",
    "ಶತಾವರಿ": "Shatavari",
    "ಅಮ್ಲಾ": "Amla",
    "ಅರಿಶಿನ": "Turmeric",

    # Locations
    "ಕರ್ನಾಟಕ": "Karnataka",
    "ಕೇರಳ": "Kerala",
    "ತಮಿಳುನಾಡು": "Tamil Nadu",
    "ರಾಜಸ್ಥಾನ": "Rajasthan",
    "ಮಹಾರಾಷ್ಟ್ರ": "Maharashtra",
    "ಆಂಧ್ರ": "Andhra",

    # Units / fillers
    "ಕಿಲೋ": "",
    "ಕಿಲೋಗ್ರಾಂ": "",
    "ಕೆಜಿ": "",
    "ಕಿಗ್ರಾ": "",
}


def translate(text):
    t = (text or "").strip()
    if not t:
        return ""

    # Normalize whitespace
    t = re.sub(r"\s+", " ", t)

    # Replace longer keys first to avoid partial overlaps
    for k in sorted(MAP.keys(), key=len, reverse=True):
        if k in t:
            t = t.replace(k, MAP[k])

    return t.strip()


def extract_data(text):
    t = (text or "").strip()
    if not t:
        return None, 0, None

    # Quantity: first integer found
    m = re.search(r"\b(\d{1,4})\b", t)
    quantity = int(m.group(1)) if m else 0

    # Herb: keyword scan (case-insensitive) over known herbs
    herbs = ["Ashwagandha", "Tulsi", "Neem", "Brahmi", "Shatavari", "Amla", "Turmeric"]
    herb = next((h for h in herbs if re.search(rf"\b{re.escape(h)}\b", t, flags=re.IGNORECASE)), None)

    # Location: keyword scan
    locations = ["Karnataka", "Kerala", "Tamil Nadu", "Rajasthan", "Maharashtra", "Andhra"]
    location = next((loc for loc in locations if re.search(rf"\b{re.escape(loc)}\b", t, flags=re.IGNORECASE)), None)

    return herb, quantity, location


class TranslatePayload(BaseModel):
    text: str


@router.post("/auto-batch")
async def auto_batch(
    file: UploadFile = File(...),
    user=Depends(get_current_user)
):

    # 🎤 Save audio
    file_location = f"temp_{file.filename}"
    with open(file_location, "wb") as f:
        f.write(await file.read())

    # 🎤 Speech → Text
    result = model.transcribe(file_location)
    original_text = result["text"]

    # 🌍 Translate
    translated = translate(original_text)

    # 📦 Extract data
    herb, quantity, location = extract_data(translated)

    if not herb or not location or quantity == 0:
        return {
            "error": "Could not understand voice properly",
            "text": translated
        }

    # 🤖 AI
    ai_result = analyze_herb()

    # 🌍 GEO
    geo_result = validate_geo(herb, location)

    # ⚠️ FRAUD
    fraud_result = detect_fraud({
        "farmer_name": user.get("email"),
        "herb_name": herb,
        "quantity": quantity,
        "location": location
    })

    # ⭐ TRUST
    trust_score = calculate_trust(
        ai_result["quality_score"],
        geo_result["geo_score"],
        fraud_result["fraud_score"]
    )

    # 🧾 DATA
    data = {
        "farmer_name": user.get("email"),
        "herb_name": herb,
        "quantity": quantity,
        "location": location,
        "geo_valid": geo_result["geo_valid"],
        "geo_score": geo_result["geo_score"],
        "quality_score": ai_result["quality_score"],
        "fraud_score": fraud_result["fraud_score"],
        "fraud_risk": fraud_result["fraud_risk"],
        "trust_score": trust_score,
        "created_by": user.get("uid")
    }

    # 🔐 HASH
    hash_val = generate_hash(data)

    # 🔗 BLOCKCHAIN
    tx_hash = store_on_blockchain(hash_val)

    data["blockchain_hash"] = hash_val
    data["tx_hash"] = tx_hash

    # 💾 DB
    result = batch_collection.insert_one(data)
    batch_id = str(result.inserted_id)
    data["_id"] = batch_id

    # 📦 QR
    qr = generate_qr(batch_id)
    data["qr_code"] = qr

    return {
        "message": "Batch created from voice 🎤",
        "voice_text": original_text,
        "translated": translated,
        "data": data
    }


@router.post("/translate")
def translate_voice_text(payload: TranslatePayload, user=Depends(get_current_user)):
    translated = translate(payload.text or "")
    herb, quantity, location = extract_data(translated)
    return {
        "translated": translated,
        "herb": herb,
        "quantity": quantity,
        "location": location,
        "requested_by": user.get("email")
    }