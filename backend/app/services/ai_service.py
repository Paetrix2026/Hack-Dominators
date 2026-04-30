import random
import re
from io import BytesIO

from PIL import Image

HERB_ALIASES = {
    "ashwagandha": "Ashwagandha",
    "tulsi": "Tulsi",
    "neem": "Neem",
    "brahmi": "Brahmi",
    "shatavari": "Shatavari",
    "amla": "Amla",
    "turmeric": "Turmeric",
    "haldi": "Turmeric",
    "mint": "Mint",
    "pudina": "Mint",
    "aloevera": "Aloe Vera",
    "aloe": "Aloe Vera",
}


def _normalize_herb_name(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = re.sub(r"[^a-z]", "", value.lower())
    return HERB_ALIASES.get(cleaned)


def _detect_from_photo_name(photo_name: str | None) -> str | None:
    if not photo_name:
        return None
    lower_name = photo_name.lower()
    for alias, canonical in HERB_ALIASES.items():
        if alias in lower_name:
            return canonical
    return None


def validate_herb_image(photo_bytes: bytes) -> tuple[bool, str]:
    """
    Basic plant-photo validation to reject clearly unrelated images.
    Heuristic:
    - image must be decodable
    - must contain a minimum amount of green-ish pixels
    """
    try:
        img = Image.open(BytesIO(photo_bytes)).convert("RGB")
    except Exception:
        return False, "Invalid image format"

    # Downsample for fast analysis
    img = img.resize((160, 160))
    pixels = list(img.getdata())
    total = max(1, len(pixels))

    green_like = 0
    for r, g, b in pixels:
        if g > 70 and g > r * 1.08 and g > b * 1.08:
            green_like += 1

    green_ratio = green_like / total
    if green_ratio < 0.08:
        return False, "Image does not appear to contain plant/herb/leaf content"
    return True, "Valid herb image"


def analyze_herb(claimed_herb: str = None, photo_name: str = None):
    """
    Lightweight herb verification:
    - tries to infer herb from photo filename first
    - falls back to claimed herb when no evidence exists
    """
    claimed = _normalize_herb_name(claimed_herb)
    detected = _detect_from_photo_name(photo_name)

    if detected:
        classified_herb = detected
        verified = True
        quality_score = random.randint(72, 92)
        match = bool(claimed and detected and claimed == detected)
    elif claimed:
        # Claimed herb without visual evidence should be treated as unverified.
        classified_herb = claimed
        verified = False
        quality_score = random.randint(45, 68)
        # No visual evidence: unknown match state (not a hard mismatch).
        match = None
    else:
        classified_herb = random.choice(list(HERB_ALIASES.values()))
        verified = False
        quality_score = random.randint(40, 60)
        match = None

    return {
        "herb": classified_herb,
        "quality_score": quality_score,
        "fraud_risk": "Low" if quality_score > 80 else "Medium",
        "match": match,
        "verified": verified,
    }
