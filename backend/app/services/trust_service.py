def calculate_trust(quality: int, geo_score: int, fraud_score: int) -> int:
    """
    Calculate overall trust score based on:
    - Quality score (AI)
    - Geo validation score
    - Fraud detection score

    Returns:
        int: Final trust score (0–100)
    """

    # 🛡️ Safety checks (avoid invalid values)
    quality = max(0, min(quality, 100))
    geo_score = max(0, min(geo_score, 100))
    fraud_score = max(0, min(fraud_score, 100))

    # 🔻 Convert fraud → penalty
    fraud_penalty = 100 - fraud_score

    # 🧠 Weighted formula
    trust = int(
        (quality * 0.5) +       # 50% weight
        (geo_score * 0.3) +     # 30% weight
        (fraud_penalty * 0.2)   # 20% weight
    )

    # 🔒 Ensure final value in range
    return max(0, min(trust, 100))