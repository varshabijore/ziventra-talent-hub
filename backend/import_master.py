"""CANDIDATE_MASTER CSV -> MongoDB candidates_master (ServiceNow + AI/ML clusters). Safe to run again: matches on linkedin_url, never touches website edits."""
import csv, re, sys, datetime as dt
from pymongo import MongoClient, UpdateOne
from app import config
src = sys.argv[1] if len(sys.argv) > 1 else "master.csv"
key = lambda k: re.sub(r"[^a-z0-9_]+", "_", re.sub(r"\s*/\s*", "_", k.strip().lower())).strip("_")
def num(v):
    try: return float(v)
    except Exception: return None
ops = {"ServiceNow": [], "AI/ML": []}
skipped = 0
with open(src, newline="", encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        d = {key(k): (v or "").strip() for k, v in r.items() if k}
        url = d.get("linkedin_url", "").lower().rstrip("/").replace("://in.linkedin.com", "://www.linkedin.com")
        pool = d.get("pool")
        if "linkedin.com/in/" not in url or pool not in ops:
            skipped += 1; continue
        d["linkedin_url"] = url
        for k in ("total_experience_years", "domain_experience_years"):
            d[k] = num(d.get(k))
        d["synced_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
        ops[pool].append(UpdateOne({"linkedin_url": url}, {"$set": d}, upsert=True))
targets = {"ServiceNow": (config.SN_MONGODB_URI, config.SN_DB), "AI/ML": (config.AI_MONGODB_URI, config.AI_DB)}
for pool, items in ops.items():
    uri, db = targets[pool]
    col = MongoClient(uri)[db][config.CANDIDATE_COLLECTION]
    col.create_index("linkedin_url")
    for i in range(0, len(items), 500):
        col.bulk_write(items[i:i + 500], ordered=False)
    print(f"{pool:10} {len(items)} rows -> {db}.{config.CANDIDATE_COLLECTION} now has {col.count_documents({})} candidates")
print("skipped (no LinkedIn URL / pool):", skipped)
