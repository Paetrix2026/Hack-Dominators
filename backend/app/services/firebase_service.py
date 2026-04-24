import firebase_admin
from firebase_admin import credentials, auth

# Initialize Firebase (only once)
cred = credentials.Certificate("app/firebase/serviceAccountKey.json")

firebase_admin.initialize_app(cred)


# 🔐 Verify Firebase Token
def verify_token(id_token: str):
    try:
        decoded_token = auth.verify_id_token(id_token)
        return decoded_token
    except Exception as e:
        print("❌ Firebase Auth Error:", e)
        return None