import logging
from typing import Any

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from pydantic import BaseModel, ConfigDict

try:
    import whisper

    _whisper = whisper
except ImportError:
    _whisper = None
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
from app.database import batch_collection, voice_input_collection
from datetime import datetime

router = APIRouter(prefix="/voice", tags=["Voice"])

logger = logging.getLogger(__name__)

_model = None


def _safe_str(value: Any, default: str = "") -> str:
    if value is None:
        return default
    if isinstance(value, bool):
        return default
    return str(value).strip()


def _mongo_safe_text(value: Any, default: str = "") -> str:
    """MongoDB forbids NUL (\\x00) in BSON string values."""
    s = _safe_str(value, default)
    return s.replace("\x00", "")


def _get_whisper_model():
    global _model
    if _whisper is None:
        raise HTTPException(
            status_code=503,
            detail="Voice service unavailable: install openai-whisper (and PyTorch) on the server.",
        )
    if _model is None:
        _model = _whisper.load_model("base")
    return _model


# 🔥 Kannada → English keyword map (common words)
# Note: speech-to-text often inserts extra words; we replace by substring, not token-equality.
MAP = {
    # Herbs
    "ಅಶ್ವಗಂಧ": "Ashwagandha",
    "ಅಶ್ವಗಂಧಾ": "Ashwagandha",
    "ತುಳಸಿ": "Tulsi",
    "ತುಳಸೀ": "Tulsi",
    "ಬೇವು": "Neem",          # Neem commonly said as "Bevu"
    "ಬೇವಿನ": "Neem",
    "ನೀಮ್": "Neem",
    "ನೀಮ": "Neem",
    "ಬ್ರಾಹ್ಮಿ": "Brahmi",
    "ಶತಾವರಿ": "Shatavari",
    "ಅಮ್ಲಾ": "Amla",
    "ಅರಿಶಿನ": "Turmeric",
    "ಪುದೀನ": "Mint",

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
    # Kannada number words
    "ಒಂದು": "1",
    "ಎರಡು": "2",
    "ಮೂರು": "3",
    "ನಾಲ್ಕು": "4",
    "ಐದು": "5",
    "ಆರು": "6",
    "ಏಳು": "7",
    "ಎಂಟು": "8",
    "ಒಂಬತ್ತು": "9",
    "ಹತ್ತು": "10",
    # Common Latin transliterations from browser speech
    "bevu": "Neem",
    "tulasi": "Tulsi",
    "thulasi": "Tulsi",
    "ashwagandha": "Ashwagandha",
    "aloevera": "Aloe Vera",
    "aloe vera": "Aloe Vera",
    "karnataka": "Karnataka",
    "kerala": "Kerala",
    # Betel (vīḷa / common spellings)
    "ವೀಳೆ": "Betel",
    "ವೀಡೆ": "Betel",
    "ವೀಲೆ": "Betel",
    "betel": "Betel",
}

_KANNADA_RE = re.compile(r"[\u0C80-\u0CFF]")


def _has_kannada_script(s: str) -> bool:
    return bool(_KANNADA_RE.search(s or ""))


def _machine_translate_to_en(text: str) -> str:
    """Kannada / mixed → English using Google Translate (free). Falls back to input on any error."""
    t = (text or "").strip()
    if not t:
        return ""
    try:
        from deep_translator import GoogleTranslator
    except ImportError:
        logger.warning("deep_translator not installed; voice text will not be machine-translated.")
        return t
    try:
        # "auto" reliably detects Kannada script; "kn" can misbehave on mixed Roman+Kannada.
        out = GoogleTranslator(source="auto", target="en").translate(t)
        if out is None:
            return t
        out_s = str(out).strip()
        if not out_s:
            return t
        # If output still contains Kannada, try explicit kn→en once.
        if _has_kannada_script(out_s) and _has_kannada_script(t):
            out2 = GoogleTranslator(source="kn", target="en").translate(t)
            if out2 and str(out2).strip():
                out_s = str(out2).strip()
        return _mongo_safe_text(out_s)
    except Exception as ex:
        logger.warning("Machine translation failed (using original text): %s", ex)
        return t


def _apply_lexicon(text: str) -> str:
    t = re.sub(r"\s+", " ", (text or "").strip())
    for k in sorted(MAP.keys(), key=len, reverse=True):
        if k in t:
            t = t.replace(k, MAP[k])
    return re.sub(r"\s+", " ", t).strip()


def translate(text):
    """
    Kannada → English for voice: full sentence to English first, then lexicon aliases.
    (Lexicon-before-MT can leave mixed Kannada+English that hurts detection.)
    """
    t = _mongo_safe_text(text, "")
    if not t:
        return ""
    t = re.sub(r"\s+", " ", t)
    t_mt = _machine_translate_to_en(t)
    return _mongo_safe_text(_apply_lexicon(t_mt), "")


def extract_data(text):
    t = (text or "").strip()
    if not t:
        return None, 0, None

    # Quantity: first Arabic numeral, or English/Kannada number words
    m = re.search(r"\b(\d{1,4})\b", t)
    quantity = int(m.group(1)) if m else 0
    if quantity == 0:
        word_to_num = {
            "one": 1,
            "two": 2,
            "three": 3,
            "four": 4,
            "five": 5,
            "six": 6,
            "seven": 7,
            "eight": 8,
            "nine": 9,
            "ten": 10,
        }
        tl = t.lower()
        for w, n in word_to_num.items():
            if re.search(rf"\b{re.escape(w)}\b", tl):
                quantity = n
                break

    # Herb: word boundary first, then substring (handles "fresh neem leaves")
    herbs = [
        "Ashwagandha",
        "Tulsi",
        "Neem",
        "Brahmi",
        "Shatavari",
        "Amla",
        "Turmeric",
        "Mint",
        "Aloe Vera",
        "Betel",
    ]
    herb = next((h for h in herbs if re.search(rf"\b{re.escape(h)}\b", t, flags=re.IGNORECASE)), None)
    if not herb:
        tl = t.lower()
        herb = next((h for h in herbs if h.lower() in tl), None)

    # Location: word boundary first, then substring
    locations = ["Karnataka", "Kerala", "Tamil Nadu", "Rajasthan", "Maharashtra", "Andhra"]
    location = next((loc for loc in locations if re.search(rf"\b{re.escape(loc)}\b", t, flags=re.IGNORECASE)), None)
    if not location:
        tl = t.lower()
        location = next((loc for loc in locations if loc.lower() in tl), None)

    return herb, quantity, location


class TranslatePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    text: str = ""


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
    model = _get_whisper_model()
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
    try:
        raw = (payload.text or "").strip()
        if not raw:
            return {
                "translated": "",
                "herb": None,
                "quantity": 0,
                "location": None,
                "requested_by": user.get("email"),
            }
        translated = translate(raw)
        herb, quantity, location = extract_data(translated)
        return {
            "translated": translated,
            "herb": herb,
            "quantity": quantity,
            "location": location,
            "requested_by": user.get("email"),
        }
    except Exception as e:
        logger.exception("translate_voice_text failed")
        raise HTTPException(status_code=503, detail=f"Translation failed: {e!s}") from e


@router.post("/input")
@router.post("/voice-input")
def voice_input(payload: dict, user=Depends(get_current_user)):
    speech_raw = payload.get("speech_text") or payload.get("text")
    speech_text = _mongo_safe_text(speech_raw, "")
    if not speech_text:
        raise HTTPException(status_code=400, detail="speech_text is required")

    try:
        translated = translate(speech_text)
        herb, quantity, parsed_location = extract_data(translated)
        location = _mongo_safe_text(
            (payload.get("location") or parsed_location or ""),
            "",
        )

        geo_result = {"geo_valid": False, "geo_score": 40, "message": "Insufficient data"}
        if herb and location:
            geo_result = validate_geo(herb, location)

        extracted = {
            "herb_name": herb,
            "quantity": quantity,
            "location": location or None,
            "geo_valid": bool(geo_result.get("geo_valid", False)),
        }

        lang = _mongo_safe_text(payload.get("language"), "auto") or "auto"

        doc = {
            "speech_text": speech_text,
            "translated_text": translated,
            "language": lang,
            "extracted": extracted,
            "requested_by": user.get("email"),
            "requested_uid": user.get("uid"),
            "created_at": datetime.utcnow().isoformat(),
        }

        doc_id: str | None = None
        try:
            ins = voice_input_collection.insert_one(doc)
            doc_id = str(ins.inserted_id)
        except Exception as db_err:
            logger.warning("voice_input MongoDB insert failed (voice still works): %s", db_err)

        return {
            "message": "Voice input processed",
            "id": doc_id,
            "persisted": doc_id is not None,
            "data": doc,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("voice_input failed")
        raise HTTPException(status_code=503, detail=f"Voice processing failed: {e!s}") from e