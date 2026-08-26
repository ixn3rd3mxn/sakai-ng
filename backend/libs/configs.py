import os

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

MONGO_URI = os.environ["MONGO_URI"]
DB_NAME = os.environ.get("DB_NAME", "ems_dashboard")

client = MongoClient(MONGO_URI)
db = client[DB_NAME]

# Angular dev server origins allowed to call this API, plus any deployed
# frontend origins supplied via env (comma-separated, e.g. the Vercel URL).
CORS_ORIGINS = [
    "http://localhost:4200",
    "http://127.0.0.1:4200",
    *[origin.strip() for origin in os.environ.get("CORS_ORIGINS", "").split(",") if origin.strip()]
]
