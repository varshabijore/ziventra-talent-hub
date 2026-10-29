"""Health check of the candidate data in MongoDB. Changes nothing, only reads.
Run inside the backend folder:   python verify_data.py
Paste the output in the chat. It contains no passwords."""
import datetime as dt
import re
from collections import Counter

from pymongo import MongoClient

from app import config

TODAY = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=5, minutes=30)).date().isoformat()
KEY = ["current_title", "current_company", "city", "total_experience_years", "domain_experience_years",
       "skills", "modules_specialization", "certifications", "past_employers", "email", "phone"]


def filled(v):
    return v not in (None, "", "-", "Not found", "Not collected", "Not mapped")


def norm(u):
    u = re.sub(r"^https?://", "", str(u or "").strip().lower())
    u = re.sub(r"^[a-z]{2,3}\.linkedin\.com", "linkedin.com", u)
    return u.split("?")[0].rstrip("/")


def host(uri):
    m = re.search(r"@([^/?]+)", uri or "")
    return m.group(1) if m else "?"


print("Today (IST):", TODAY)
print("Website reads ServiceNow from:", host(config.SN_MONGODB_URI), "/", config.SN_DB)
print("Website reads AI/ML      from:", host(config.AI_MONGODB_URI), "/", config.AI_DB)

for label, uri, db, want in [("ServiceNow", config.SN_MONGODB_URI, config.SN_DB, "ServiceNow"),
                             ("AI/ML", config.AI_MONGODB_URI, config.AI_DB, "AI/ML")]:
    cli = MongoClient(uri, serverSelectionTimeoutMS=15000)
    col = cli[db][config.CANDIDATE_COLLECTION]
    docs = list(col.find({}, {"_id": 0}))
    n = len(docs)
    print(f"\n===== {label}: {host(uri)} / {db}.{config.CANDIDATE_COLLECTION} = {n} docs =====")
    print("  other collections in this db:", ", ".join(f"{c}({cli[db][c].estimated_document_count()})" for c in cli[db].list_collection_names()))
    print("  pool field     :", dict(Counter(d.get("pool") for d in docs)), "<- should be only", want)
    urls = Counter(norm(d.get("linkedin_url")) for d in docs)
    print("  duplicates     :", sum(c - 1 for c in urls.values() if c > 1), "| missing LinkedIn URL:", urls.get("", 0))
    idx = [list(i["key"].keys()) for i in col.list_indexes()]
    print("  indexes        :", idx, "(linkedin_url index:", "YES" if ["linkedin_url"] in idx else "NO", ")")
    print("  readiness      :", dict(Counter(d.get("readiness") for d in docs).most_common()))
    print("  source_flow    :", dict(Counter(d.get("source_flow") for d in docs).most_common()))
    print("  title_match    :", dict(Counter(d.get("title_match") for d in docs).most_common()))
    print("  'Not mapped' standard_title:", sum(1 for d in docs if d.get("standard_title") == "Not mapped"))
    print("  first_seen today:", sum(1 for d in docs if str(d.get("first_seen", ""))[:10] == TODAY),
          "| last_updated today:", sum(1 for d in docs if str(d.get("last_updated", ""))[:10] == TODAY),
          "| refreshed ever:", sum(1 for d in docs if filled(d.get("last_checked"))))
    last = sorted(str(d.get("last_updated") or "") for d in docs)[-1:] or ["-"]
    print("  newest last_updated:", last[0])
    for grp, rows in [("Enriched", [d for d in docs if d.get("readiness") == "Enriched"]),
                      ("Discovered", [d for d in docs if d.get("readiness") == "Discovered"])]:
        if rows:
            print(f"  fill % for {grp} ({len(rows)}):",
                  ", ".join(f"{k}={round(100 * sum(1 for d in rows if filled(d.get(k))) / len(rows))}" for k in KEY))
    en_today = [d for d in docs if d.get("readiness") == "Enriched" and str(d.get("last_updated", ""))[:10] == TODAY]
    weak = [d.get("name") for d in en_today if not filled(d.get("domain_experience_years")) or not filled(d.get("skills"))]
    print(f"  enriched today: {len(en_today)}, of which missing experience or skills: {len(weak)} {weak[:5]}")
    bad_city = sum(1 for d in docs if not filled(d.get("city")))
    print("  missing city:", bad_city, "| emails:", Counter(d.get("email_status") for d in docs if filled(d.get("email"))).most_common())

app = MongoClient(config.SN_MONGODB_URI, serverSelectionTimeoutMS=15000)[config.APP_DB]
print("\n===== talent_app (website data) =====")
print("  collections:", ", ".join(f"{c}({app[c].estimated_document_count()})" for c in app.list_collection_names()))
print("\nDone. Nothing was changed.")
