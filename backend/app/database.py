from pymongo import MongoClient

client = MongoClient("mongodb://localhost:27017")

db = client["ayurtrust"]

batch_collection = db["batches"]
herb_request_collection = db["herb_requests"]