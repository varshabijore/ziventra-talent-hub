"""One-time: load the past n8n runs (28 Oct - 2 Nov, from the sheet's "runs" tab) into talent_app.runs,
so the Automation page has history from day one. Safe to run twice: runs already there are skipped.
Run inside the backend folder:   python import_runs.py"""
from pymongo import MongoClient

from app import config
from app.run_seed import RUNS

col = MongoClient(config.SN_MONGODB_URI, serverSelectionTimeoutMS=15000)[config.APP_DB]["runs"]
added = 0
for r in RUNS:
    if col.count_documents({"run_at": r["run_at"], "flow": r["flow"]}):
        continue
    col.insert_one(dict(r))
    added += 1
col.create_index("run_at")
print(f"Added {added} runs ({len(RUNS) - added} were already there). talent_app.runs now has {col.count_documents({})} runs.")
