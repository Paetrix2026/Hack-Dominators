import json
import os

import firebase_admin
from firebase_admin import credentials, auth

_initialized = False


def _ensure_firebase() -> bool:
    """Initialize Firebase once. Uses env JSON on Render, else local file if present."""
    global _initialized
    if _initialized:
        return True
    if firebase_admin._apps:
        _initialized = True
        return True

    cred = None
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    if raw:
        try:
            cred = credentials.Certificate(json.loads(raw))
        except (json.JSONDecodeError, ValueError) as e:
            print("❌ FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON:", e)
            return False

    if cred is None:
        path = os.environ.get(
            "FIREBASE_CREDENTIALS_PATH", "app/firebase/serviceAccountKey.json"
        )
        if os.path.isfile(path):
            cred = credentials.Certificate(path)

    if cred is None:
        print(
            "⚠️ Firebase Admin not configured: set FIREBASE_SERVICE_ACCOUNT_JSON "
            "(full service account JSON) or FIREBASE_CREDENTIALS_PATH to a key file."
        )
        return False

    firebase_admin.initialize_app(cred)
    _initialized = True
    return True


def verify_token(id_token: str):
    if not _ensure_firebase():
        return None
    try:
        decoded_token = auth.verify_id_token(id_token)
        return decoded_token
    except Exception as e:
        print("❌ Firebase Auth Error:", e)
        return None
