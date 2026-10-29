"""Quick check before starting the API: can we reach both clusters and write to talent_app?
   python check_db.py"""
from app import config

print("DATA_MODE:", config.DATA_MODE)
if not config.SN_MONGODB_URI:
    raise SystemExit("SN_MONGODB_URI is empty. Fill backend/.env first (copy .env.example to .env).")

from pymongo import MongoClient

for label, uri, db in [("ServiceNow", config.SN_MONGODB_URI, config.SN_DB), ("AI/ML", config.AI_MONGODB_URI or config.SN_MONGODB_URI, config.AI_DB)]:
    try:
        c = MongoClient(uri, serverSelectionTimeoutMS=10000)
        n = c[db][config.CANDIDATE_COLLECTION].count_documents({})
        print(f"OK  {label:10} {db}.{config.CANDIDATE_COLLECTION}: {n} candidates")
    except Exception as e:
        print(f"ERR {label:10} {type(e).__name__}: {str(e)[:200]}")

try:
    c = MongoClient(config.SN_MONGODB_URI, serverSelectionTimeoutMS=10000)
    t = c[config.APP_DB]["_check"]
    t.insert_one({"ok": 1})
    t.drop()
    print(f"OK  can write to database '{config.APP_DB}' (users, logs, settings go here)")
except Exception as e:
    print(f"ERR writing to '{config.APP_DB}': {type(e).__name__}: {str(e)[:200]}")
    print("    Ask sir to give this database user readWrite on the talent_app database (Atlas > Database Access).")
