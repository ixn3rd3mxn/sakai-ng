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

# Build id of this deployment. Echoed to every SSE client on connect so an
# already-open board can tell a redeploy apart from the free tier simply
# cold-starting the process - the second happens all day and means nothing.
#
# Unset is a deliberate, safe default: the frontend ignores a missing build id
# entirely rather than guessing, so leaving this alone costs only the backend
# half of the update notice. Set it to the deployed commit (the platform
# usually exposes one) to turn that half on.
APP_BUILD = os.environ.get("APP_BUILD", "").strip() or None
