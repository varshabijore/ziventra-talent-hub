"""Example data for DATA_MODE=memory (local demo and tests). These are invented people, not real candidates."""
import datetime as dt, random
from . import security
from .store import now

FIRST = ["Aarav", "Ananya", "Rohit", "Sneha", "Arjun", "Priya", "Karthik", "Meera", "Sahil", "Divya", "Nikhil", "Isha", "Varun",
         "Pooja", "Aditya", "Kavya", "Rahul", "Neha", "Vikram", "Shreya", "Manish", "Riya", "Siddharth", "Tanvi", "Harsh", "Nisha"]
LAST = ["Sharma", "Iyer", "Mehra", "Kulkarni", "Nair", "Verma", "Reddy", "Joshi", "Gupta", "Menon", "Bansal", "Kapoor", "Rao", "Das", "Patel", "Singh"]
CITIES = [("Bengaluru", "Karnataka"), ("Hyderabad", "Telangana"), ("Pune", "Maharashtra"), ("Chennai", "Tamil Nadu"), ("Noida", "Uttar Pradesh"),
          ("Gurugram", "Haryana"), ("Mumbai", "Maharashtra"), ("Kochi", "Kerala"), ("Kolkata", "West Bengal")]
COS = ["TCS", "Infosys", "Accenture", "Wipro", "HCLTech", "Cognizant", "Deloitte", "Capgemini", "Tech Mahindra", "LTIMindtree"]
SN = [("ServiceNow Developer", "Developer"), ("ServiceNow Administrator", "Administrator"), ("ServiceNow Architect", "Architect"),
      ("ServiceNow Consultant", "Consultant"), ("ServiceNow Business Analyst", "BA"), ("ServiceNow Tester", "Tester")]
AI = [("Machine Learning Engineer", "ML Engineering"), ("GenAI Engineer", "GenAI"), ("Data Scientist", "Data Science"),
      ("NLP Engineer", "NLP"), ("MLOps Engineer", "MLOps"), ("Computer Vision Engineer", "Computer Vision")]


def seed(st):
    rnd = random.Random(7)
    today = dt.date.today()
    st.user_insert({"name": "Varsha", "email": "admin@ziventra.com", "password_hash": security.hash_password("demo1234"),
                    "role": "admin", "status": "active", "created_at": now(), "last_login": None})
    for i in range(140):
        pool = "sn" if i % 5 < 3 else "ai"
        title, role = rnd.choice(SN if pool == "sn" else AI)
        city, state = rnd.choice(CITIES)
        name = f"{rnd.choice(FIRST)} {rnd.choice(LAST)}"
        first = (today - dt.timedelta(days=rnd.choice([0, 0, 0, 1, 1, 2, 3, 4, 6, 8, 11, 15, 22, 35]))).isoformat()
        enriched = rnd.random() < 0.45 or i in (2, 3, 4, 5, 6, 7, 8, 9)
        dexp = round(rnd.uniform(0.5, 11), 1)
        doc = {"pool": "ServiceNow" if pool == "sn" else "AI/ML", "name": name,
               "linkedin_url": f"https://www.linkedin.com/in/{name.lower().replace(' ', '-')}-{i:03d}",
               "standard_title": title, "current_title": title if rnd.random() < .8 else "Senior Software Engineer",
               "current_company": rnd.choice(COS), "city": city, "state": state, "title_match": rnd.choice(["Exact", "Exact", "Related"]),
               "role_category": role, "readiness": "Enriched" if enriched else "Discovered",
               "first_seen": first, "last_updated": first, "source_flow": rnd.choice(["n8n", "n8n", "claude", "python (purana data)"]),
               "search_query": f"{title} / {city}", "open_to_work": rnd.choice(["Yes", "No", "Unknown", "Unknown"]), "consent": "No"}
        if i in (2, 4, 7):  # demo: Apollo data on a few profiles
            doc.update({"apollo_status": "Matched", "apollo_email": f"{name.split()[0].lower()}.{name.split()[1].lower()}@{doc['current_company'].lower().split()[0]}.com",
                        "apollo_email_status": "verified" if i != 7 else "extrapolated", "apollo_personal_email": f"{name.split()[0].lower()}{i}@gmail.com" if i == 2 else "",
                        "apollo_phone": "+91 98450 1234" + str(i) if i in (2, 4) else "requested" if i == 7 else "not found", "apollo_title": title, "apollo_company": doc["current_company"],
                        "apollo_city": city, "apollo_checked_at": today.isoformat() + " 12:30"})
        if i in (2, 3, 5, 6, 8, 9):  # demo: Treg email results
            fn, ln = name.split()[0].lower(), name.split()[1].lower()
            doc.update({"treg_status": "Found" if i != 9 else "Not found", "treg_work_email": f"{fn}.{ln}@{doc['current_company'].lower().split()[0]}.com" if i in (2, 3, 5, 8) else "",
                        "treg_work_verified": "yes" if i in (2, 5) else "no" if i in (3, 8) else "", "treg_personal_email": f"{fn}{ln}{i}@gmail.com" if i in (2, 3, 6) else "",
                        "treg_served_by": "blitzapi, fiber-ai", "treg_cost": 0.04 if i in (2, 3, 6) else 0.0005, "treg_checked_at": today.isoformat() + " 13:05"})
        if enriched:
            doc.update({"total_experience_years": round(dexp + rnd.uniform(0, 4), 1), "domain_experience_years": dexp,
                        "experience_bucket": "0-2" if dexp < 2 else "2-5" if dexp < 5 else "5-8" if dexp < 8 else "8+",
                        "skills": "JavaScript; ServiceNow; REST" if pool == "sn" else "Python; PyTorch; SQL",
                        "modules_specialization": rnd.choice(["ITSM; CMDB", "ITOM; Discovery", "HRSD", "CSM"]) if pool == "sn" else rnd.choice(["GenAI; RAG", "NLP", "MLOps", "Computer Vision"]),
                        "certifications": rnd.choice(["", "CSA", "CSA; CAD", "CIS-ITSM"]) if pool == "sn" else rnd.choice(["", "AWS ML Specialty", ""]),
                        "email": rnd.choice(["", f"{name.split()[0].lower()}.{name.split()[1].lower()}@gmail.com", f"{name.split()[0].lower()}@example-corp.com"]),
                        "last_updated": min(today, dt.date.fromisoformat(first) + dt.timedelta(days=rnd.choice([0, 1]))).isoformat(),
                        "notes": f"Full profile scraped {first} (n8n)"})
            if rnd.random() < .35:
                doc["phone"] = f"+91 9{rnd.randint(100000000, 999999999)}"
            if rnd.random() < .15:
                doc["last_checked"] = today.isoformat()
                doc["last_change"] = f"{today.isoformat()}: company: {rnd.choice(COS)} -> {doc['current_company']}"
        else:
            doc["experience_bucket"] = "Unknown"
        st.candidate_insert(pool, doc)
    # demo run log: the real n8n runs from the sheet, moved so the last day is today
    import datetime as _dt
    from .run_seed import RUNS
    last = _dt.date.fromisoformat(RUNS[-1]["date"])
    shift = today - last
    for r in RUNS:
        d = (_dt.date.fromisoformat(r["date"]) + shift).isoformat()
        st._runs.append({**r, "date": d, "run_at": d + " " + r["time"]})
    t = today.isoformat()
    st._runs.append({"run_at": t + " 15:41", "date": t, "time": "15:41", "flow": "n8n (refresh)", "added": "", "cost": 0.1,
                     "notes": "25 checked, 3 changed. Actor harvestapi/linkedin-profile-scraper."})
    st._runs.append({"run_at": t + " 12:30", "flow": "n8n (apollo)", "found": 3, "rejected": 0, "added": "3 matched", "cost": 0,
                     "matched": 3, "emails_added": 0, "verified": 1, "credits": 19,
                     "notes": "Apollo: 3 matched of 3, 0 no match, 0 errors. Emails: 1 verified, 0 unverified, 0 personal. Added to sheet: 0 emails. Phones requested: 2. Credits ~19"})
    st._runs.append({"run_at": t + " 13:05", "flow": "n8n (treg)", "found": 6, "added": "5 emails", "cost": 0.122, "checked": 6,
                     "work_found": 4, "personal_found": 3, "emails_added": 5,
                     "notes": "Treg: 6 checked. Work emails: 4, personal emails: 3. Added to sheet: 5 emails. Cost $0.122"})
    st._errors = [{"at": t + "T13:13:05", "workflow": "Candidate scraping - ServiceNow + AI_ML (Google Sheet) (Cloud)",
                   "node": "Apify Google search", "message": "Request failed with status code 402 (demo error)", "url": ""}]
