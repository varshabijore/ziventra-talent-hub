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
    t = today.isoformat()
    for tm, kind, res, cost in [("10:12", "Scraping", "44 new (26 ServiceNow + 18 AI/ML)", 0.02), ("11:41", "Enrichment", "25 enriched, 0 rejected", 0.25),
                                ("13:12", "Scraping", "52 new (31 ServiceNow + 21 AI/ML)", 0.07), ("15:41", "Refresh", "25 checked, 3 changed", 0.10),
                                ("16:12", "Scraping", "57 new (29 ServiceNow + 28 AI/ML)", 0.07)]:
        st._runs.append({"date": t, "time": tm, "job": kind, "by": "n8n", "result": res, "cost": cost})
