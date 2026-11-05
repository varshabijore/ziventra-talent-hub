"""LinkedIn accounts page (TRIAL, 5 Nov 2026): connect an account (li_at cookie), run a LinkedIn people search
through Apify (curious_coder/linkedin-people-search-scraper) and import the people into a pool.

Safety:
  * the cookie is stored ENCRYPTED (key derived from JWT_SECRET) and is never sent back to the browser
  * max 100 people per run and a daily limit per account (guide: 50-100 per run, 1-2 runs a day)
  * "Disconnect" deletes the cookie at once
  * APIFY_TOKEN lives only in Render's environment, never in code
"""
import base64
import datetime as dt
import hashlib
import hmac
import json
import os
import re
import secrets
import urllib.request

from . import config, transfer

IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
ACTOR = os.environ.get("LI_ACTOR", "curious_coder~linkedin-people-search-scraper")
APIFY_TOKEN = os.environ.get("APIFY_TOKEN", "").strip()
MAX_PER_RUN = 100
DEFAULT_DAILY = 100


def _now():
    return dt.datetime.now(IST).strftime("%Y-%m-%d %H:%M")


# ---------- encryption (stdlib only): HMAC-SHA256 keystream + HMAC tag ----------
def _keys():
    base = hashlib.sha256(("li-cookie|" + config.JWT_SECRET).encode()).digest()
    return hmac.new(base, b"enc", hashlib.sha256).digest(), hmac.new(base, b"mac", hashlib.sha256).digest()


def _stream(key, nonce, n):
    out, i = b"", 0
    while len(out) < n:
        out += hmac.new(key, nonce + i.to_bytes(4, "big"), hashlib.sha256).digest()
        i += 1
    return out[:n]


def encrypt(text):
    ke, km = _keys()
    nonce = secrets.token_bytes(16)
    data = text.encode()
    ct = bytes(a ^ b for a, b in zip(data, _stream(ke, nonce, len(data))))
    tag = hmac.new(km, nonce + ct, hashlib.sha256).digest()
    return base64.b64encode(nonce + tag + ct).decode()


def decrypt(blob):
    ke, km = _keys()
    raw = base64.b64decode(blob)
    nonce, tag, ct = raw[:16], raw[16:48], raw[48:]
    if not hmac.compare_digest(tag, hmac.new(km, nonce + ct, hashlib.sha256).digest()):
        raise ValueError("cookie could not be decrypted (JWT_SECRET changed?)")
    return bytes(a ^ b for a, b in zip(ct, _stream(ke, nonce, len(ct)))).decode()


# ---------- Apify ----------
def _apify(method, path, body=None):
    req = urllib.request.Request("https://api.apify.com/v2" + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": "Bearer " + APIFY_TOKEN, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode() or "null")


def demo_mode():
    return not APIFY_TOKEN and config.DATA_MODE == "memory"


class LinkedInService:
    def __init__(self, store, cand):
        self.store, self.cand = store, cand

    # ----- accounts -----
    def _public(self, a, today_used):
        return {"id": a["id"], "label": a["label"], "hint": a.get("hint", ""), "status": a.get("status", "connected"),
                "daily_limit": a.get("daily_limit", DEFAULT_DAILY), "used_today": today_used.get(a["id"], 0),
                "connected_at": a.get("connected_at"), "connected_by": a.get("connected_by"), "last_run": a.get("last_run"),
                "found_total": a.get("found_total", 0), "added_total": a.get("added_total", 0)}

    def _used_today(self):
        day = _now()[:10]
        used = {}
        for r in self.store.li_list("runs"):
            if str(r.get("started_at", ""))[:10] == day and r.get("status") != "failed":
                used[r["account_id"]] = used.get(r["account_id"], 0) + int(r.get("count") or 0)
        return used

    def connect(self, label, cookie, user_agent, daily_limit, user):
        label = str(label or "").strip()[:40]
        cookie = re.sub(r"\s+", "", str(cookie or "")).strip().strip('"')
        if cookie.lower().startswith("li_at="):
            cookie = cookie[6:]
        if not label:
            return {"error": "Give the account a name (e.g. Test account 1)"}
        if len(cookie) < 60 or not re.fullmatch(r"[A-Za-z0-9_\-%.=]+", cookie):
            return {"error": "This does not look like an li_at cookie. Copy only the VALUE of li_at (F12 > Application > Cookies > linkedin.com)."}
        try:
            limit = max(10, min(int(daily_limit or DEFAULT_DAILY), 200))
        except ValueError:
            limit = DEFAULT_DAILY
        acc = {"id": secrets.token_hex(6), "label": label, "cookie_enc": encrypt(cookie), "hint": "••••" + cookie[-4:],
               "user_agent": str(user_agent or "")[:400], "daily_limit": limit, "status": "connected",
               "connected_at": _now(), "connected_by": user["name"], "found_total": 0, "added_total": 0}
        self.store.li_put("accounts", acc)
        return {"ok": True, "account": self._public(acc, {})}

    def disconnect(self, aid):
        self.store.li_del("accounts", aid)
        return {"ok": True}

    # ----- runs -----
    def start(self, aid, pool, search_url, count, user):
        acc = next((a for a in self.store.li_list("accounts") if a["id"] == aid), None)
        if not acc:
            return {"error": "Choose a connected account"}
        if not self.cand.pool_key(pool):
            return {"error": "Choose a pool"}
        url = str(search_url or "").strip()
        if not re.match(r"https://(www\.)?linkedin\.com/search/results/people/", url):
            return {"error": "Paste a LinkedIn PEOPLE search URL: search on LinkedIn, click People, add filters, copy the address bar."}
        try:
            count = max(10, min(int(count or 50), MAX_PER_RUN))
        except ValueError:
            count = 50
        used = self._used_today().get(aid, 0)
        left = acc.get("daily_limit", DEFAULT_DAILY) - used
        if left <= 0:
            return {"error": f"Daily limit reached for {acc['label']} ({acc.get('daily_limit')} people). Try tomorrow; this keeps the account safe."}
        count = min(count, left)
        run = {"id": secrets.token_hex(6), "account_id": aid, "account": acc["label"], "pool": pool, "search_url": url[:1500],
               "count": count, "status": "running", "started_at": _now(), "by": user["name"], "found": 0, "added": 0,
               "existing": 0, "hidden": 0, "message": ""}
        if demo_mode():
            run["apify_run"] = "demo"
        else:
            if not APIFY_TOKEN:
                return {"error": "APIFY_TOKEN is not set on the server (Render > Environment)."}
            try:
                cookie = decrypt(acc["cookie_enc"])
            except ValueError as e:
                return {"error": str(e) + " Disconnect and connect the account again."}
            inp = {"cookie": [{"name": "li_at", "value": cookie, "domain": ".linkedin.com", "path": "/", "secure": True, "httpOnly": True}],
                   "searchUrl": url, "userAgent": acc.get("user_agent") or "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
                   "startPage": 1, "count": count, "minDelay": 5, "maxDelay": 15}
            try:
                r = (_apify("POST", f"/acts/{ACTOR}/runs?timeout=1800", inp) or {}).get("data") or {}
            except Exception as e:
                return {"error": f"Apify did not start the run: {str(e)[:160]}"}
            run["apify_run"], run["dataset"] = r.get("id"), r.get("defaultDatasetId")
        self.store.li_put("runs", run)
        acc["last_run"] = run["started_at"]
        self.store.li_put("accounts", acc)
        return {"ok": True, "run": run}

    def _items(self, run):
        if run.get("apify_run") == "demo":
            return [{"fullName": "Demo Person One", "headline": "Actimize Consultant at Demo Bank", "location": "Pune, Maharashtra, India",
                     "profileUrl": "https://www.linkedin.com/in/demo-person-one?miniProfileUrn=x", "distance": "DISTANCE_2"},
                    {"fullName": "LinkedIn Member", "headline": "Engineer", "profileUrl": "https://www.linkedin.com/search/results/people/headless"},
                    {"fullName": "Demo Person Two", "headline": "AML Analyst | Actimize", "location": "Bengaluru, Karnataka, India",
                     "profileUrl": "https://www.linkedin.com/in/demo-person-two", "distance": "DISTANCE_2"}], "SUCCEEDED"
        info = (_apify("GET", f"/actor-runs/{run['apify_run']}") or {}).get("data") or {}
        status = info.get("status", "RUNNING")
        if status in ("READY", "RUNNING"):
            return None, status
        items = _apify("GET", f"/datasets/{run.get('dataset') or info.get('defaultDatasetId')}/items?clean=true&format=json") if status == "SUCCEEDED" else []
        return items or [], status

    def refresh(self, user):
        """Check running runs on Apify; finished ones are imported into their pool."""
        for run in self.store.li_list("runs"):
            if run.get("status") != "running":
                continue
            try:
                items, status = self._items(run)
            except Exception as e:
                run["message"] = f"Could not read the run from Apify: {str(e)[:120]}"
                self.store.li_put("runs", run)
                continue
            if items is None:
                continue
            acc = next((a for a in self.store.li_list("accounts") if a["id"] == run["account_id"]), None)
            if status != "SUCCEEDED":
                run.update(status="failed", message=f"Apify run {status.lower()}. Open the run in Apify Console for the log.", finished_at=_now())
                self.store.li_put("runs", run)
                continue
            rows, hidden = [], 0
            for it in items:
                name = str(it.get("fullName") or f"{it.get('firstName', '')} {it.get('lastName', '')}").strip()
                url = transfer.clean_url(it.get("profileUrl") or it.get("url"))
                if not url or not name or "linkedin member" in name.lower():
                    hidden += 1
                    continue
                loc = str(it.get("location") or "")
                rows.append({"name": name, "linkedin_url": url, "pool": run["pool"], "current_title": str(it.get("headline") or "")[:200],
                             "city": loc.split(",")[0].strip(), "notes": f"LinkedIn search via account '{run['account']}' ({run['started_at'][:10]})"})
            mapping = {k: k for k in ("name", "linkedin_url", "pool", "current_title", "city", "notes")}
            res = self.cand.import_rows(rows, mapping, run["pool"], "skip", user, commit=True, source="LinkedIn search (account)") if rows else {"new": 0, "skip": 0, "errors": []}
            run.update(status="done", finished_at=_now(), found=len(items), hidden=hidden,
                       added=int(res.get("added", res.get("new", 0)) or 0), existing=int(res.get("skip", 0) or 0) + int(res.get("same", 0) or 0),
                       message="0 people came back: the cookie may be logged out or the account restricted. Connect a fresh li_at." if not items else
                       ("Most names were hidden (LinkedIn Member): use 2nd-degree filter or grow the account's network." if hidden > len(items) / 2 else ""))
            self.store.li_put("runs", run)
            if acc:
                acc["found_total"] = acc.get("found_total", 0) + len(items)
                acc["added_total"] = acc.get("added_total", 0) + run["added"]
                acc["status"] = "check cookie" if not items else "connected"
                self.store.li_put("accounts", acc)

    def page(self, user):
        self.refresh(user)
        used = self._used_today()
        accs = sorted(self.store.li_list("accounts"), key=lambda a: a.get("connected_at", ""), reverse=True)
        runs = sorted(self.store.li_list("runs"), key=lambda r: r.get("started_at", ""), reverse=True)[:40]
        return {"accounts": [self._public(a, used) for a in accs],
                "runs": [{k: v for k, v in r.items() if k not in ("apify_run", "dataset")} for r in runs],
                "apify_ready": bool(APIFY_TOKEN) or demo_mode(), "demo": demo_mode(), "max_per_run": MAX_PER_RUN,
                "pools": self.cand.pool_names()}
