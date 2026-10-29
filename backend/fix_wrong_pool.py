"""Removes candidates that were saved in the wrong cluster
(ServiceNow candidates inside ai_ml.candidates_master, or AI/ML candidates inside servicenow.candidates_master).
Run inside the backend folder:

    python fix_wrong_pool.py            -> only CHECKS (nothing is changed)
    python fix_wrong_pool.py --apply    -> really removes them

Candidates with website edits (manual.*) are never removed; they are listed so you can check them by hand.
"""
import sys

from pymongo import MongoClient

from app import config

APPLY = "--apply" in sys.argv
pools = [("ServiceNow", config.SN_MONGODB_URI, config.SN_DB, "AI/ML"),
         ("AI/ML", config.AI_MONGODB_URI or config.SN_MONGODB_URI, config.AI_DB, "ServiceNow")]

for label, uri, dbname, wrong in pools:
    col = MongoClient(uri, serverSelectionTimeoutMS=15000)[dbname][config.CANDIDATE_COLLECTION]
    by_pool = {}
    for d in col.find({}, {"pool": 1}):
        p = d.get("pool") or "(no pool field)"
        by_pool[p] = by_pool.get(p, 0) + 1
    print(f"\n{dbname}.{config.CANDIDATE_COLLECTION} ({label} cluster): {sum(by_pool.values())} documents")
    for p, n in sorted(by_pool.items()):
        print(f"   pool = {p:16} {n}")
    q = {"pool": wrong}
    edited = col.count_documents({**q, "manual": {"$exists": True}})
    n = col.count_documents({**q, "manual": {"$exists": False}})
    if not n and not edited:
        print("   OK, nothing in the wrong place")
        continue
    if edited:
        print(f"   {edited} wrong-pool candidates have website edits -> NOT removed, check them by hand")
    if APPLY:
        r = col.delete_many({**q, "manual": {"$exists": False}})
        print(f"   Removed {r.deleted_count} '{wrong}' candidates. Now {col.count_documents({})} documents.")
    else:
        print(f"   Would remove {n} '{wrong}' candidates. Run with --apply to do it.")

print("\nDone." if APPLY else "\nNothing was changed (check mode).")
