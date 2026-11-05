"""TEMPORARY: pause scraping for the pools that Google search hardly finds (niche pools),
so every hourly search goes to the pools that give lots of candidates.

Run inside the backend folder (with the .venv python):

    python pause_low_pools.py            -> shows what would be paused (nothing changes)
    python pause_low_pools.py --apply    -> pauses them
    python pause_low_pools.py --resume   -> turns scraping back on for exactly the pools this script paused

Pools kept running: the 4 built-in pools (always on) + the ones listed in KEEP.
Pools you had paused yourself before (like "united states") stay paused after --resume.
"""
import sys

from pymongo import MongoClient

from app import config

KEEP = {"python developer", "ms fabric architect", "power apps developer"}   # good Google results
APPLY, RESUME = "--apply" in sys.argv, "--resume" in sys.argv

col = MongoClient(config.SN_MONGODB_URI, serverSelectionTimeoutMS=15000)[config.APP_DB]["settings"]
s = col.find_one({"_id": "main"}) or {}
pools = s.get("custom_pools", [])
marked = set(s.get("temp_paused", []))

if RESUME:
    back = [p["name"] for p in pools if p["name"] in marked]
    for p in pools:
        if p["name"] in marked:
            p["scrape"] = True
    col.update_one({"_id": "main"}, {"$set": {"custom_pools": pools}, "$unset": {"temp_paused": ""}})
    print(f"Scraping back ON for {len(back)} pools:")
    for n in back:
        print("   ", n)
    sys.exit()

to_pause = [p["name"] for p in pools if p["name"].strip().lower() not in KEEP and p.get("scrape", True) is not False]
keep = [p["name"] for p in pools if p["name"].strip().lower() in KEEP]
print("Keep scraping: ServiceNow, AI/ML, Salesforce, Workday,", ", ".join(keep))
print(f"\nPause {len(to_pause)} pools:")
for n in to_pause:
    print("   ", n)
if APPLY:
    for p in pools:
        if p["name"] in to_pause:
            p["scrape"] = False
    col.update_one({"_id": "main"}, {"$set": {"custom_pools": pools, "temp_paused": sorted(marked | set(to_pause))}})
    print("\nPAUSED. The next hourly scraping run uses only the pools above. Undo later with:  python pause_low_pools.py --resume")
else:
    print("\nNothing changed yet. Run again with --apply.")
