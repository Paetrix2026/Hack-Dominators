import os

from pymongo import MongoClient

# Render / cloud: set MONGODB_URI in the host dashboard (e.g. MongoDB Atlas connection string).
# Default localhost is only for local development.
_mongo_uri = (
    os.environ.get("MONGODB_URI", "").strip()
    or os.environ.get("DATABASE_URL", "").strip()
    or "mongodb://localhost:27017"
)
client = MongoClient(_mongo_uri)

db = client["ayurtrust"]

batch_collection = db["batches"]
herb_request_collection = db["herb_requests"]