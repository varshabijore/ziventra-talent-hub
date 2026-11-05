"""Fixes candidates whose Apollo mobile is stuck at "requested" in MongoDB.

Why: the Apollo workflow wrote apollo_phone = "requested" a few seconds AFTER the phone webhook had already
saved the real number, so the number was overwritten (fixed in n8n with a 90 second Wait in the webhook).
The real number is still in the sheet, and the sync copies it into the `phone` field.

Run inside the backend folder:

    python fix_apollo_phones.py            -> only CHECKS (nothing is changed)
    python fix_apollo_phones.py --apply    -> really fixes them

What it does for every candidate with apollo_phone = "requested":
  * `phone` has a number and phone_status says Apollo  -> apollo_phone = that number
  * checked more than 2 hours ago and no Apollo number  -> apollo_phone = "not found" (Apollo had none)
  * otherwise (checked recently)                        -> left alone, the number may still arrive
"""
import datetime as dt
import sys

from pymongo import MongoClient

from app import config

APPLY = "--apply" in sys.argv
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
cutoff = (dt.datetime.now(IST) - dt.timedelta(hours=2)).strftime("%Y-%m-%d %H:%M")

places = [("ServiceNow", config.SN_MONGODB_URI, config.SN_DB, config.CANDIDATE_COLLECTION),
          ("AI/ML", config.AI_MONGODB_URI or config.SN_MONGODB_URI, config.AI_DB, config.CANDIDATE_COLLECTION),
          ("Salesforce", config.SF_MONGODB_URI, config.SF_DB, config.CANDIDATE_COLLECTION),
          ("Workday", config.WD_MONGODB_URI, config.WD_DB, config.CANDIDATE_COLLECTION),
          ("Added pools", config.SN_MONGODB_URI, config.APP_DB, "candidates_custom")]

total = {"number": 0, "not found": 0, "waiting": 0}
for label, uri, dbname, coll in places:
    if not uri:
        print(f"{label}: no connection string in .env, skipped")
        continue
    col = MongoClient(uri, serverSelectionTimeoutMS=15000)[dbname][coll]
    fixed = {"number": 0, "not found": 0, "waiting": 0}
    for d in col.find({"apollo_phone": "requested"}, {"name": 1, "phone": 1, "phone_status": 1, "apollo_checked_at": 1}):
        ph, st = str(d.get("phone") or "").strip(), str(d.get("phone_status") or "").lower()
        at = str(d.get("apollo_checked_at") or "")[:16]
        if ph[:1] in "+0123456789" and ph and "apollo" in st:
            new, kind = ph, "number"
        elif at and at < cutoff:
            new, kind = "not found", "not found"
        else:
            fixed["waiting"] += 1
            continue
        fixed[kind] += 1
        print(f"   {label:12} {str(d.get('name') or '')[:30]:30} -> {'number from sheet' if kind == 'number' else 'not found'}")
        if APPLY:
            col.update_one({"_id": d["_id"]}, {"$set": {"apollo_phone": new}})
    print(f"{label}: {fixed['number']} numbers restored, {fixed['not found']} marked not found, {fixed['waiting']} still waiting")
    for k in total:
        total[k] += fixed[k]

print(f"\nTotal: {total['number']} numbers restored, {total['not found']} not found, {total['waiting']} still waiting.")
print("Changes SAVED." if APPLY else "Nothing changed yet. Run again with --apply to save.")
