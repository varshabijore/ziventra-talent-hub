"""One-time: add today's n8n runs that were written only to the sheet's "runs" tab (not to MongoDB),
so the Automation page stops showing them as "Missed run". Safe to run twice (existing runs are skipped).
Run inside the backend folder:   python backfill_runs.py"""
from pymongo import MongoClient

from app import config

RUNS = [  # copied from the sheet's "runs" tab, 2 Nov 2026
    {"run_at": "2026-11-02 11:42", "flow": "n8n (enrichment)", "queries": 0, "google_results": "", "found": 25, "rejected": 0,
     "added": "24 enriched", "cost": 0.25, "notes": "Emails: 5 valid, 6 risky. Scrape failed: 1. Actor harvestapi/linkedin-profile-scraper."},
    {"run_at": "2026-11-02 13:13", "flow": "n8n (scheduled)", "queries": 15, "google_results": 131, "found": 29, "rejected": 3,
     "added": "26", "cost": 0.067, "notes": "13 ServiceNow + 13 AI/ML. Rejected: duplicate 3."},
]

col = MongoClient(config.SN_MONGODB_URI, serverSelectionTimeoutMS=15000)[config.APP_DB]["runs"]
added = 0
for r in RUNS:
    if col.count_documents({"run_at": r["run_at"], "flow": r["flow"]}):
        continue
    col.insert_one(dict(r))
    added += 1
print(f"Added {added} runs ({len(RUNS) - added} were already there). talent_app.runs now has {col.count_documents({})} runs.")
