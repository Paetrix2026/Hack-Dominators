# 🌍 Herb region mapping

HERB_REGIONS = {
    "Ashwagandha": ["Karnataka", "Madhya Pradesh", "Rajasthan"],
    "Tulsi": ["Karnataka", "Tamil Nadu", "Uttar Pradesh"],
    "Neem": ["All"],
}


def validate_geo(herb, location):

    valid_regions = HERB_REGIONS.get(herb, [])

    # 🌍 Universal herbs
    if "All" in valid_regions:
        return {
            "geo_valid": True,
            "geo_score": 100,
            "message": "Valid everywhere"
        }

    # ✅ Match
    if location in valid_regions:
        return {
            "geo_valid": True,
            "geo_score": 100,
            "message": "Valid region"
        }

    # ❌ Mismatch
    return {
        "geo_valid": False,
        "geo_score": 40,
        "message": f"{herb} not usually grown in {location}"
    }