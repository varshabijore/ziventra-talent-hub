"""Weekly backup of the candidate data (MongoDB free tier has no automatic backups).
Run inside the backend folder:   python backup.py
Writes backups/backup-YYYY-MM-DD.json.gz (both pools + website edits history). Keep the file somewhere safe (Drive).
Restore later with:   python backup.py --restore backups/backup-YYYY-MM-DD.json.gz   (only fills an EMPTY collection)"""
import datetime as dt
import gzip
import json
import os
import sys

from bson import json_util
from pymongo import MongoClient

from app import config

SOURCES = {
    "servicenow": (config.SN_MONGODB_URI, config.SN_DB, config.CANDIDATE_COLLECTION),
    "ai_ml": (config.AI_MONGODB_URI or config.SN_MONGODB_URI, config.AI_DB, config.CANDIDATE_COLLECTION),
    "talent_app_audit": (config.SN_MONGODB_URI, config.APP_DB, "audit"),
    "talent_app_runs": (config.SN_MONGODB_URI, config.APP_DB, "runs"),
}


def col(name):
    uri, db, c = SOURCES[name]
    return MongoClient(uri, serverSelectionTimeoutMS=20000)[db][c]


if "--restore" in sys.argv:
    path = sys.argv[sys.argv.index("--restore") + 1]
    data = json_util.loads(gzip.open(path, "rt", encoding="utf-8").read())
    for name, docs in data["collections"].items():
        c = col(name)
        if c.estimated_document_count():
            print(f"skip {name}: collection is not empty ({c.estimated_document_count()} docs)")
        elif docs:
            c.insert_many(docs)
            print(f"restored {name}: {len(docs)} docs")
    sys.exit()

os.makedirs("backups", exist_ok=True)
out = {"made_at": dt.datetime.now().isoformat(timespec="seconds"), "collections": {}}
for name in SOURCES:
    docs = list(col(name).find({}))
    out["collections"][name] = docs
    print(f"{name:18} {len(docs)} docs")
path = os.path.join("backups", f"backup-{dt.date.today().isoformat()}.json.gz")
with gzip.open(path, "wt", encoding="utf-8") as f:
    f.write(json_util.dumps(out))
print(f"Saved {path} ({os.path.getsize(path) // 1024} KB). Upload it to Drive; never to GitHub.")
