"""One-time: the 3 Nov Apollo phone search was done by Claude directly (not through n8n), so the website's
Contacts tab did not know about it. This writes the same apollo_* fields that the n8n Apollo workflow writes,
plus one run log entry. It also puts the phone numbers found in the earlier Apollo tests (Apollo_test tab)
on those candidates, so every number found so far shows on the website right away. Safe to run twice.
Run inside the backend folder:   python apollo_3nov.py"""
import re
from pymongo import MongoClient

from app import config

AT = "2026-11-03 10:58"
# (pool, linkedin slug, phone, apollo email, email status, apollo title / company)
PEOPLE = [
    ("sn", "nausheen-banu-bb648813b", "+918374865428", "nausheen.banu@capgemini.com", "verified", "Capgemini"),
    ("sn", "aman-rampally", "+919177292272", "amanrampally@gmail.com", "verified", "Wipro"),
    ("sn", "divya-sharma-0173568b", "+918103593721", "divya.sharma@cognizant.com", "verified", "Cognizant"),
    ("sn", "anand-kulkarni222", "+918618032830", "anandkulkarni1@kpmg.com", "verified", "KPMG"),
    ("sn", "nataraj-h-97840185", "+919738513392", "", "unavailable", "JPMorgan Chase & Co."),
    ("sn", "keertanya-s-111636222", "+919742628554", "keertanya.s@nagarro.com", "verified", "Nagarro"),
    ("sn", "kumar-abhishek-0b5125178", "+918502818063", "abhishek.kumar@atos.net", "verified", "Atos"),
    ("sn", "sudarshan-puppala-953989145", "+917795277403", "", "unavailable", "Kyndryl"),
    ("sn", "binu-bhatia-68288968", "+918527020123", "binu.bhatia@cloud-raptor.com", "verified", "Cloud Raptor"),
    ("ai", "akash-basudevan", "+917073200759", "", "unavailable", "Google"),
    ("ai", "joydeep-bhattacharjee-934a1157", "+918981849869", "", "unavailable", "Adobe"),
    ("sn", "bhagyesh-tonpekar-07291a15b", "", "bhagyesh.tonpekar@servicenow.com", "extrapolated", "ServiceNow"),
    ("ai", "vijaypss", "", "vijay.prasad@gainwelltechnologies.com", "verified", "Gainwell Technologies"),
    ("sn", "imran-khan-pathan-bb016611a", None, "", "", ""),   # not in Apollo
]
# earlier tests (Apollo_test tab): phone only, they are already in the sheet's phone column too
TEST = [("sn", "barani-tharan", "+918610897643"), ("sn", "santoshmadeti", "+919845311328"), ("ai", "ankur-das-145b13157", "+917980990834"),
        ("ai", "rohit-bohra23", "+919611901656"), ("ai", "vishal-nanaware-956740200", "+917410133358")]
RUN = {"run_at": AT, "flow": "Apollo (done by Claude, by hand)", "found": 14, "rejected": 1, "added": "13 matched", "cost": 0,
       "matched": 13, "emails_added": 0, "verified": 7, "credits": 104,
       "notes": "Apollo: 13 matched of 14, 1 no match, 0 errors. Mobiles found: 11. Phones written to the sheet. Credits ~104 "
                "(+3 used on an email-only test that matched nobody useful)."}

sn = MongoClient(config.SN_MONGODB_URI, serverSelectionTimeoutMS=15000)
ai = MongoClient(config.AI_MONGODB_URI, serverSelectionTimeoutMS=15000) if config.AI_MONGODB_URI else sn
cols = {"sn": sn[config.SN_DB][config.CANDIDATE_COLLECTION], "ai": ai[config.AI_DB][config.CANDIDATE_COLLECTION]}
done = missing = 0
for pool, slug, phone, email, es, company in PEOPLE:
    q = {"linkedin_url": {"$regex": "linkedin\\.com/in/" + re.escape(slug) + "/?$", "$options": "i"}}
    doc = cols[pool].find_one(q)
    if not doc:
        print("not found in MongoDB yet:", slug); missing += 1; continue
    s = {"apollo_checked_at": AT}
    if phone is None:
        s["apollo_status"] = "No match"
    else:
        s.update({"apollo_status": "Matched", "apollo_phone": phone, "apollo_email": email, "apollo_email_status": es, "apollo_company": company})
        if phone and not str(doc.get("phone") or "").strip():
            s.update({"phone": phone, "phone_status": "Apollo mobile (high confidence)"})
    cols[pool].update_one({"_id": doc["_id"]}, {"$set": s}); done += 1
for pool, slug, phone in TEST:
    q = {"linkedin_url": {"$regex": "linkedin\\.com/in/" + re.escape(slug) + "/?$", "$options": "i"}}
    doc = cols[pool].find_one(q)
    if not doc:
        print("not found in MongoDB yet:", slug); missing += 1; continue
    if not str(doc.get("phone") or "").strip():
        cols[pool].update_one({"_id": doc["_id"]}, {"$set": {"phone": phone, "phone_status": "Apollo mobile (test, high confidence)"}})
    done += 1
runs = sn[config.APP_DB]["runs"]
if not runs.count_documents({"run_at": AT, "flow": RUN["flow"]}):
    runs.insert_one(dict(RUN))
print(f"Updated {done} candidates ({missing} not found). Run log added. Refresh the Contacts tab.")
