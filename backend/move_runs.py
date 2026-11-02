"""One-time fix: n8n's "Mongo run log" nodes used a credential whose database is `servicenow`, so run logs
landed in servicenow.runs instead of talent_app.runs (which the website reads).
This copies them to talent_app.runs (skips ones already there), then removes ONLY the copied ones from servicenow.runs.
Candidates (servicenow.candidates_master) are not touched.
Run inside the backend folder:   python move_runs.py"""
from pymongo import MongoClient

from app import config

cli = MongoClient(config.SN_MONGODB_URI, serverSelectionTimeoutMS=15000)
src, dst = cli[config.SN_DB]["runs"], cli[config.APP_DB]["runs"]
docs = list(src.find({}))
print(f"Found {len(docs)} run log(s) in {config.SN_DB}.runs (wrong place)")
moved = skipped = 0
for d in docs:
    key = {"run_at": d.get("run_at"), "flow": d.get("flow")}
    if dst.count_documents(key):
        skipped += 1
    else:
        dst.insert_one({k: v for k, v in d.items() if k != "_id"})
        moved += 1
    src.delete_one({"_id": d["_id"]})
    print(f"  {d.get('run_at')}  {d.get('flow')}")
print(f"Moved {moved}, {skipped} were already in {config.APP_DB}.runs. {config.APP_DB}.runs now has {dst.count_documents({})} runs.")
if src.count_documents({}) == 0 and docs:
    src.drop()
    print(f"Removed the empty {config.SN_DB}.runs collection.")
