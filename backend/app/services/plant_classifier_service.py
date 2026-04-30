"""
plant_classifier_service.py
----------------------------
Uses Google Gemini 1.5 Flash Vision to determine whether an uploaded image
contains a plant, herb, or any Ayurvedic botanical.

Returns:
    { "is_plant": bool, "reason": str, "confidence": "high" | "low" }

Fails OPEN on any API / quota errors (logs a warning, allows the image through)
so the portal never goes down because of the classifier.
"""

import base64
import json
import logging
import os
import re
from io import BytesIO
from dotenv import load_dotenv
from PIL import Image

load_dotenv() # Force load .env

logger = logging.getLogger(__name__)

# Supported MIME types for the Gemini Vision call
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}

# Maximum file size: 10 MB
MAX_FILE_BYTES = 10 * 1024 * 1024

_GEMINI_PROMPT = (
    "You are a strict botanical image validator for an Ayurvedic herb supply chain. "
    "Inspect this image carefully. "
    "Your ONLY job is to decide whether the image shows a plant, herb, or any part of a "
    "botanical / medicinal plant (leaf, root, bark, flower, seed, stem, dried herb, "
    "powder from a plant, or any Ayurvedic raw material). "
    "Answer ONLY with a JSON object — no markdown, no extra text — in this exact format:\n"
    '{"is_plant": true, "reason": "Image shows ashwagandha roots"}\n'
    "or\n"
    '{"is_plant": false, "reason": "Image shows a human selfie"}\n'
    "Do NOT accept images of people, human faces, selfies, portraits, hands holding random objects, "
    "animals, vehicles, buildings, packaged food products, cooked dishes, electronic devices, "
    "or any unrelated objects — even if there is some green in the background."
)


def _heuristic_plant_check(image_bytes: bytes) -> dict:
    """
    Offline fallback when Gemini is unavailable.
    Uses simple green-dominance detection to reject obviously unrelated images.
    """
    try:
        img = Image.open(BytesIO(image_bytes)).convert("RGB").resize((160, 160))
        pixels = list(img.getdata())
        total = max(1, len(pixels))
        green_like = 0
        for r, g, b in pixels:
            if g > 70 and g > r * 1.08 and g > b * 1.08:
                green_like += 1
        green_ratio = green_like / total
        if green_ratio < 0.08:
            return {
                "is_plant": False,
                "reason": "Image does not appear to contain herb/leaf/plant content",
                "confidence": "low",
            }
        # Reject likely human skin / portrait when plant signal is weak (offline, no Gemini)
        skin_like = 0
        for r, g, b in pixels:
            if 90 <= r <= 250 and 35 <= g <= 220 and 15 <= b <= 200 and r >= g - 15 and r >= b - 10:
                skin_like += 1
        skin_ratio = skin_like / total
        if skin_ratio > 0.20 and green_ratio < 0.18:
            return {
                "is_plant": False,
                "reason": "Image looks like a person or skin tones, not a plant or herb photo",
                "confidence": "low",
            }
        return {
            "is_plant": True,
            "reason": "Likely plant image (offline heuristic)",
            "confidence": "low",
        }
    except Exception:
        return {
            "is_plant": False,
            "reason": "Invalid image data",
            "confidence": "low",
        }


def _try_import_genai():
    """Lazy-import so the service degrades gracefully if the package is missing."""
    try:
        import google.generativeai as genai  # noqa: F401
        return genai
    except ImportError:
        logger.warning(
            "google-generativeai is not installed. Run: pip install google-generativeai>=0.7.0"
        )
        return None


def is_explicit_non_plant(is_plant_val) -> bool:
    """
    True only when the classifier clearly rejected the image (do not upload).
    Missing/unknown values are treated as NOT explicit reject (fail-open for API quirks).
    """
    if is_plant_val is False:
        return True
    if isinstance(is_plant_val, str):
        t = is_plant_val.strip().lower()
        return t in ("false", "0", "no", "n")
    return False


def validate_is_plant_image(image_bytes: bytes, mime_type: str) -> dict:
    """
    Classify whether image_bytes represents a plant/herb image.

    Args:
        image_bytes: Raw bytes of the uploaded image.
        mime_type:   MIME type reported by the upload (e.g. "image/jpeg").

    Returns:
        dict with keys:
            is_plant   (bool)   — True if a plant/herb, False otherwise.
            reason     (str)    — Human-readable explanation.
            confidence (str)    — "high" | "low"

    Raises:
        ValueError: If the file type is not an accepted image format or too large.
    """
    # ── Stage 1: basic file checks ────────────────────────────────────────────
    # Normalise MIME (browsers sometimes send "image/jpg")
    norm_mime = mime_type.lower().strip()
    if norm_mime == "image/jpg":
        norm_mime = "image/jpeg"

    if norm_mime not in ALLOWED_MIME:
        raise ValueError(
            f"Unsupported file type '{mime_type}'. "
            "Please upload a JPEG, PNG, WebP, or GIF image."
        )

    if len(image_bytes) > MAX_FILE_BYTES:
        raise ValueError("Image file is too large (max 10 MB).")

    # ── Stage 2: Gemini Vision call ───────────────────────────────────────────
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        logger.warning("GEMINI_API_KEY not set. Using offline plant validation heuristic.")
        return _heuristic_plant_check(image_bytes)

    genai = _try_import_genai()
    if genai is None:
        return _heuristic_plant_check(image_bytes)

    try:
        genai.configure(api_key=api_key)
        # Using 2.0 Flash as confirmed by your test script
        model = genai.GenerativeModel("models/gemini-2.0-flash")

        b64_data = base64.b64encode(image_bytes).decode("utf-8")

        response = model.generate_content(
            [
                {"inline_data": {"mime_type": norm_mime, "data": b64_data}},
                _GEMINI_PROMPT,
            ]
        )

        raw_text = (response.text or "").strip()
        logger.info("Gemini plant classifier raw response (truncated): %s", raw_text[:500])

        # Robustly extract the JSON object from the response
        match = re.search(r'\{.*?\}', raw_text, re.DOTALL)
        if not match:
            logger.warning("Could not parse JSON from Gemini response; using heuristic.")
            return _heuristic_plant_check(image_bytes)

        result = json.loads(match.group())
        is_plant = result.get("is_plant")
        reason = result.get("reason")

        # Normalise is_plant to bool for downstream checks (models sometimes return strings)
        if isinstance(is_plant, str):
            low = is_plant.strip().lower()
            if low in ("true", "1", "yes", "y"):
                result["is_plant"] = True
            elif low in ("false", "0", "no", "n"):
                result["is_plant"] = False
            else:
                result["is_plant"] = None
        elif is_plant is not None:
            result["is_plant"] = bool(is_plant)

        logger.info(
            "Gemini plant classifier: is_plant=%s reason=%s",
            result.get("is_plant"),
            (reason or "")[:200],
        )

        result["confidence"] = "high"
        return result

    except Exception as exc:
        err_msg = str(exc)
        if "429" in err_msg or "quota" in err_msg.lower():
            logger.warning(
                "Gemini quota exceeded or rate limited; failing open to heuristic. (%s)",
                err_msg[:200],
            )
        else:
            logger.warning("Gemini plant classifier error; failing open to heuristic: %s", err_msg[:300])

        return _heuristic_plant_check(image_bytes)
