"""End-to-end API test against a running server in memory mode:
   DATA_MODE=memory uvicorn app.main:app --port 8800   then   python tests/test_api.py"""
import os, sys, requests
B = os.environ.get("API", "http://127.0.0.1:8800/api")
fails = 0
def check(name, cond, extra=""):
    global fails
    print(("PASS " if cond else "FAIL ") + name + (f"  {extra}" if extra and not cond else ""))
    fails += 0 if cond else 1

r = requests.get(B + "/health"); check("health", r.ok and r.json()["mode"] == "memory")
r = requests.post(B + "/auth/login", json={"email": "admin@ziventra.com", "password": "bad"}); check("wrong password 401", r.status_code == 401)
r = requests.post(B + "/auth/login", json={"email": "admin@ziventra.com", "password": "demo1234"}); check("admin login", r.ok, r.text)
A = {"Authorization": "Bearer " + r.json()["token"]}
check("no password hash in login", "password_hash" not in r.json()["user"])
r = requests.get(B + "/dashboard"); check("dashboard needs login", r.status_code == 401)
r = requests.post(B + "/auth/signup", json={"name": "X", "email": "x@y.com", "password": "secret123"}); check("signup removed", r.status_code in (404, 405))
r = requests.get(B + "/users", headers=A); check("users removed", r.status_code == 404)
d = requests.get(B + "/dashboard", headers=A).json()
check("dashboard", d["total"] == 140 and len(d["daily"]) == 30 and d["cities"] and "hire_status" not in d, str(d.keys()))
r = requests.get(B + "/daily", headers=A); check("daily", r.ok and "summary" in r.json())
s = requests.get(B + "/candidates?pool=ServiceNow&size=10", headers=A).json()
check("list + stats", len(s["items"]) == 10 and "hire_status" not in s["items"][0] and "hire_status" not in s["facets"])
cid = s["items"][0]["id"]
c = requests.get(B + f"/candidates/{cid}", headers=A).json(); check("detail", c["id"] == cid and c["fields"])
before = c["percent"]
r = requests.patch(B + f"/candidates/{cid}", json={"changes": {"phone": "+91 9876543210"}, "base": c["updated_at"]}, headers=A)
check("edit", r.ok and r.json()["phone"] == "+91 9876543210" and r.json()["percent"] >= before, r.text[:200])
check("history", any("Phone" in h["text"] for h in r.json()["history"]))
r = requests.patch(B + f"/candidates/{cid}", json={"changes": {"open_to_work": "Maybe"}}, headers=A); check("option validation", r.status_code == 400)
r = requests.get(B + "/candidates/export?pool=AI/ML", headers=A); check("csv export", r.ok and "AI/ML" in r.text)
r = requests.post(B + "/auth/password", json={"current": "demo1234", "new": "newsecret456"}, headers=A); check("change password", r.ok)
r = requests.post(B + "/auth/login", json={"email": "admin@ziventra.com", "password": "newsecret456"}); check("login new password", r.ok)
requests.post(B + "/auth/password", json={"current": "newsecret456", "new": "demo1234"}, headers={"Authorization": "Bearer " + r.json()["token"]})
print("\nFAILED:", fails) if fails else print("\nALL PASSED")
sys.exit(1 if fails else 0)
