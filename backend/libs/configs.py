import os

import certifi
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

MONGO_URI = os.environ["MONGO_URI"]
DB_NAME = os.environ.get("DB_NAME", "ems_dashboard")

# Explicit CA bundle: on Windows, newer Python/OpenSSL builds fail the TLS
# handshake against Atlas without this (SSL: TLSV1_ALERT_INTERNAL_ERROR).
client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
db = client[DB_NAME]

# Angular dev server origins allowed to call this API.
CORS_ORIGINS = [
    "http://localhost:4200",
    "http://127.0.0.1:4200"
]
