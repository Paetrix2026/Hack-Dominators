import os
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

# Load backend/.env so MONGODB_URI works locally (never commit .env).
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# Render / cloud: set MONGODB_URI in the host dashboard (e.g. MongoDB Atlas connection string).
# Default localhost is only for local development.
_mongo_uri = (
    os.environ.get("MONGODB_URI", "").strip()
    or os.environ.get("MONGO_URI", "").strip()
    or os.environ.get("DATABASE_URL", "").strip()
    or "mongodb://localhost:27017"
)
def _mask_mongo_uri(uri: str) -> str:
    if not uri:
        return uri
    # mongodb://user:pass@host -> mongodb://user:***@host
    if "@" in uri and "://" in uri:
        prefix, rest = uri.split("://", 1)
        before_at, after_at = rest.split("@", 1)
        if ":" in before_at:
            user, _ = before_at.split(":", 1)
            return f"{prefix}://{user}:***@{after_at}"
        return f"{prefix}://***@{after_at}"
    return uri

print(f"[database] Mongo URI used: {_mask_mongo_uri(_mongo_uri)}")

client = MongoClient(_mongo_uri)

db = client["ayurtrust"]

batch_collection = db["batches"]
herb_request_collection = db["herb_requests"]
voice_input_collection = db["voice_inputs"]