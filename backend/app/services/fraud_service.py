# 🚨 Fraud Detection Service

from app.database import batch_collection


def detect_fraud(data):

    fraud_score = 0
    fraud_risk = "Low"

    # ⚠️ Rule 1: Duplicate batch (same farmer + herb + location)
    existing = batch_collection.find_one({
        "farmer_name": data["farmer_name"],
        "herb_name": data["herb_name"],
        "location": data["location"]
    })

    if existing:
        fraud_score += 40

    # ⚠️ Rule 2: Unrealistic quantity
    if data["quantity"] > 1000:
        fraud_score += 30

    # ⚠️ Rule 3: Suspicious empty data
    if not data["farmer_name"] or not data["herb_name"]:
        fraud_score += 30

    # 🎯 Final Risk Level
    if fraud_score >= 70:
        fraud_risk = "High"
    elif fraud_score >= 40:
        fraud_risk = "Medium"

    return {
        "fraud_score": fraud_score,
        "fraud_risk": fraud_risk
    }