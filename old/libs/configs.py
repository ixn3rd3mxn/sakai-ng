from pymongo import MongoClient

client = MongoClient("mongodb://localhost:27017")
db = client["dashboardrescue"]

shiftwork_collection = db["shiftwork"]
incident_collection = db["incident"]
cbdcriteria_collection = db["cbdcriteria"]
cbdlevel_collection = db["cbdlevel"]