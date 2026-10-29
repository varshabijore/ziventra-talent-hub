"""Finds candidates saved twice (same LinkedIn profile) in candidates_master and removes the extra copy.
Run inside the backend folder (it reads backend/.env):

    python fix_duplicates.py            -> only CHECKS and prints what it would do (nothing is changed)
    python fix_duplicates.py --apply    -> really removes the duplicates

Which copy is kept: the newest one (written by n8n, so it has the latest sheet data).
Website edits (manual.*) and edit history from the removed copy are moved to the kept copy, so nothing typed by a person is lost.
"""
import re
import sys
from collections import defaultdict

from pymongo import MongoClient

from app import config

APPLY = "--apply" in sys.argv
KEEP_FROM_OLD = ["manual", "manual_meta", "custom", "app_updated_at", "app_updated_by"]


def norm(url):
    """Same LinkedIn profile written in different ways -> one key."""
    u = str(url or "").strip().lower()
    u = re.sub(r"^https?://", "", u)
    u = re.sub(r"^[a-z]{2,3}\.linkedin\.com", "linkedin.com", u)  # in.linkedin.com, www.linkedin.com
    u = u.split("?")[0].split("#")[0].rstrip("/")
    return u


app_db = MongoClient(config.SN_MONGODB_URI, serverSelectionTimeoutMS=15000)[config.APP_DB]
pools = [("sn", "ServiceNow", config.SN_MONGODB_URI, config.SN_DB),
         ("ai", "AI/ML", config.AI_MONGODB_URI or config.SN_MONGODB_URI, config.AI_DB)]

for prefix, label, uri, dbname in pools:
    col = MongoClient(uri, serverSelectionTimeoutMS=15000)[dbname][config.CANDIDATE_COLLECTION]
    docs = list(col.find({}))
    groups = defaultdict(list)
    no_url = 0
    for d in docs:
        k = norm(d.get("linkedin_url"))
        if not k:
            no_url += 1
            continue
        groups[k].append(d)
    dup_groups = [g for g in groups.values() if len(g) > 1]
    extra = sum(len(g) - 1 for g in dup_groups)
    print(f"\n{label}: {len(docs)} documents, {len(groups)} unique LinkedIn profiles, {extra} duplicates, {no_url} without LinkedIn URL")

    if dup_groups:
        g = sorted(dup_groups[0], key=lambda d: d["_id"].generation_time)
        print("  Example of one duplicate (why they did not match):")
        for d in g:
            print(f"    created {d['_id'].generation_time:%Y-%m-%d %H:%M}  linkedin_url={d.get('linkedin_url')!r}  fields={len(d)}")

    removed = 0
    for g in dup_groups:
        g.sort(key=lambda d: d["_id"].generation_time, reverse=True)  # newest first
        keep, olds = g[0], g[1:]
        for old in olds:
            move = {f: old[f] for f in KEEP_FROM_OLD if old.get(f) and not keep.get(f)}
            if APPLY:
                if move:
                    col.update_one({"_id": keep["_id"]}, {"$set": move})
                    keep.update(move)
                app_db.audit.update_many({"cand": f"{prefix}:{old['_id']}"}, {"$set": {"cand": f"{prefix}:{keep['_id']}"}})
                col.delete_one({"_id": old["_id"]})
            removed += 1
    if APPLY:
        print(f"  Removed {removed} duplicates. {label} now has {col.count_documents({})} candidates.")
    elif removed:
        print(f"  Would remove {removed} duplicates -> {len(docs) - removed} candidates left. Run with --apply to do it.")

print("\nDone." if APPLY else "\nNothing was changed (check mode).")
