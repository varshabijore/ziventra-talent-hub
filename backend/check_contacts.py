"""Checks that Apollo / Treg results were saved in the RIGHT cluster:
ServiceNow candidates -> ServiceNow cluster (servicenow db), AI/ML candidates -> AI/ML cluster (ai_ml db).
Read only: nothing is changed.   Run inside the backend folder:   python check_contacts.py"""
from pymongo import MongoClient

from app import config

Q = {"$or": [{"apollo_checked_at": {"$exists": True}}, {"treg_checked_at": {"$exists": True}}]}
F = {"_id": 0, "name": 1, "pool": 1, "linkedin_url": 1, "apollo_status": 1, "apollo_phone": 1, "treg_status": 1}
CL = [("ServiceNow", config.SN_MONGODB_URI, config.SN_DB), ("AI/ML", config.AI_MONGODB_URI, config.AI_DB)]

bad = 0
for label, uri, db in CL:
    col = MongoClient(uri, serverSelectionTimeoutMS=15000)[db][config.CANDIDATE_COLLECTION]
    docs = list(col.find(Q, F))
    print(f"\n=== {label} cluster ({db}.{config.CANDIDATE_COLLECTION}): {len(docs)} candidates with Apollo/Treg data ===")
    for d in docs:
        wrong = d.get("pool") != label
        bad += wrong
        what = ", ".join(x for x in [f"Apollo {d['apollo_status']}" if d.get("apollo_status") else "",
                                      "mobile found" if str(d.get("apollo_phone") or "").startswith("+") else "",
                                      f"Treg {d['treg_status']}" if d.get("treg_status") else ""] if x)
        print(f"  {'WRONG CLUSTER -> ' if wrong else 'ok  '}{d.get('name')} [{d.get('pool')}]  {what}")
    # a doc saved only with apollo_/treg_ fields (no name/pool) means a write went to the wrong place
    orphans = col.count_documents({**Q, "name": {"$exists": False}})
    if orphans:
        bad += orphans
        print(f"  WRONG: {orphans} document(s) have only Apollo/Treg fields and no candidate (written to the wrong cluster)")

# where is one AI/ML test candidate? (python check_contacts.py bhushan1630)
import sys
for slug in sys.argv[1:]:
    print(f"\n--- looking for '{slug}' in both clusters ---")
    for label, uri, db in CL:
        col = MongoClient(uri, serverSelectionTimeoutMS=15000)[db][config.CANDIDATE_COLLECTION]
        hits = list(col.find({"linkedin_url": {"$regex": slug, "$options": "i"}}, {"_id": 0, "name": 1, "pool": 1, "linkedin_url": 1, "treg_status": 1, "synced_at": 1}))
        print(f"  {label} cluster: " + ("; ".join(f"{h.get('name')} [{h.get('pool')}] url={h.get('linkedin_url')} treg={h.get('treg_status', '-')} synced={str(h.get('synced_at', '-'))[:16]}" for h in hits) or "not found"))

print("\nRESULT:", "ALL OK - every candidate is in its own cluster" if not bad else f"{bad} problem(s) found - send this output to Claude")
