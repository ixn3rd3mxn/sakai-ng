from pymongo import MongoClient

MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "ems_dashboard"

client = MongoClient(MONGO_URI)
db = client[DB_NAME]

# Angular dev server origins allowed to call this API.
CORS_ORIGINS = [
    "http://localhost:4200",
    "http://127.0.0.1:4200"
]
