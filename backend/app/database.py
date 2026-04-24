import os

from pymongo import MongoClient

_mongo_uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
client = MongoClient(_mongo_uri)

db = client["ayurtrust"]

batch_collection = db["batches"]
herb_request_collection = db["herb_requests"]