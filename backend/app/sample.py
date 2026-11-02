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
        enriched = rnd.random() < 0.45
        dexp = round(rnd.uniform(0.5, 11), 1)
        doc = {"pool": "ServiceNow" if pool == "sn" else "AI/ML", "name": name,
               "linkedin_url": f"https://www.linkedin.com/in/{name.lower().replace(' ', '-')}-{i:03d}",
               "standard_title": title, "current_title": title if rnd.random() < .8 else "Senior Software Engineer",
               "current_company": rnd.choice(COS), "city": city, "state": state, "title_match": rnd.choice(["Exact", "Exact", "Related"]),
               "role_category": role, "readiness": "Enriched" if enriched else "Discovered",
               "first_seen": first, "last_updated": first, "source_flow": rnd.choice(["n8n", "n8n", "claude", "python (purana data)"]),
               "search_query": f"{title} / {city}", "open_to_work": rnd.choice(["Yes", "No", "Unknown", "Unknown"]), "consent": "No"}
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
    st._errors = [{"at": t + "T13:13:05", "workflow": "Candidate scraping - ServiceNow + AI_ML (Google Sheet) (Cloud)",
                   "node": "Apify Google search", "message": "Request failed with status code 402 (demo error)", "url": ""}]
