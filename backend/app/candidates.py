"""Candidate logic: merge automation data with people's edits, filters, KPI cards, dashboard and daily numbers.
Automation (n8n) writes the normal fields. People's edits go to `manual.<field>`, which n8n never touches,
and the screen always shows the manual value when there is one."""
import datetime as dt, threading, time
from . import config, scoring
from .store import POOLS, now

IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
HIRING = ["New", "Contacted", "Interested", "Shortlisted", "Placed", "Rejected"]
DATA_STATUS = ["Discovered", "Enriched", "Refreshed", "Rejected"]


def today_ist():
    return dt.datetime.now(IST).date().isoformat()


def num(v):
    try:
        return round(float(v), 1)
    except (TypeError, ValueError):
        return None


def iso(v):
    if isinstance(v, dt.datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=dt.timezone.utc)
        return v.isoformat()
    return str(v or "")


class Candidates:
    """Keeps all candidates in memory. Reads from MongoDB happen in the background, so a page request
    never waits for the database (except the very first load after the server starts)."""

    def __init__(self, store):
        self.store = store
        self._lock = threading.Lock()
        self._docs = None
        self._loaded = 0.0
        self._refreshing = False
        self._ver = 0            # bumps whenever the data changes; computed results are keyed by it
        self._views = None       # (ver, list of views)
        self._memo = {}          # (name, ver, params) -> result
        self._fields = (0.0, None)

    # ---------- loading ----------
    def _load(self):
        docs = {}
        for key in POOLS:
            for d in self.store.candidates(key):
                d["_pool"] = key
                docs[f"{key}:{d['_id']}"] = d
        return docs

    def _refresh_bg(self):
        try:
            docs = self._load()
            with self._lock:
                self._docs, self._loaded = docs, time.time()
                self._ver += 1
                self._memo.clear()
        except Exception:
            pass
        finally:
            self._refreshing = False

    def docs(self):
        with self._lock:
            if self._docs is None:
                self._docs, self._loaded = self._load(), time.time()
                self._ver += 1
            elif time.time() - self._loaded > config.CACHE_SECONDS and not self._refreshing:
                # stale: answer with what we have now, fetch fresh data in the background
                self._refreshing = True
                threading.Thread(target=self._refresh_bg, daemon=True).start()
            return self._docs

    def warm(self):
        """Called at server start so the first visitor does not wait."""
        threading.Thread(target=lambda: (self.docs(), self.all_views()), daemon=True).start()

    def invalidate(self):
        with self._lock:
            self._docs = None
            self._ver += 1
            self._memo.clear()

    def _changed(self):
        with self._lock:
            self._ver += 1
            self._memo.clear()

    def memo(self, name, params, fn):
        key = (name, self._ver, tuple(sorted((params or {}).items())))
        if key in self._memo:
            return self._memo[key]
        out = fn()
        if len(self._memo) > 200:
            self._memo.clear()
        self._memo[key] = out
        return out

    def fields(self):
        ts, f = self._fields
        if f is None or time.time() - ts > 60:
            f = scoring.all_fields(self.store.settings_get())
            self._fields = (time.time(), f)
        return f

    # ---------- one candidate as the screen sees it ----------
    def view(self, cid, d, fields, bookmarks=frozenset()):
        man = d.get("manual") or {}
        v = {k: val for k, val in d.items() if k not in ("manual", "manual_meta", "_id", "_pool")}
        v.update(man)
        v["custom"] = d.get("custom") or {}
        v["id"] = cid
        v["pool"] = d.get("pool") or POOLS[d["_pool"]]
        readiness = str(d.get("readiness") or "Discovered")
        v["data_status"] = "Rejected" if readiness == "Rejected" else "Refreshed" if d.get("last_checked") else \
            "Enriched" if readiness in ("Enriched", "Talent-pool ready") else "Discovered"
        v["hire_status"] = d.get("hire_status") or "New"
        app_at = iso(d.get("app_updated_at"))
        auto_at = str(d.get("last_checked") or d.get("last_updated") or d.get("first_seen") or "")
        if app_at and app_at[:10] >= auto_at[:10]:
            v["updated_at"], v["updated_by"] = app_at, d.get("app_updated_by") or "Website"
        else:
            v["updated_at"] = auto_at
            v["updated_by"] = "n8n refresh" if d.get("last_checked") and d.get("last_checked") == auto_at else "n8n automation"
        sc = scoring.score(v, fields)
        v["percent"], v["missing"] = sc["percent"], sc["missing"]
        v["bookmarked"] = cid in bookmarks
        v["manual_fields"] = sorted(man.keys())
        for k in ("total_experience_years", "domain_experience_years", "expected_salary"):
            if k in v:
                v[k] = num(v[k]) if v[k] not in ("", None) else None
        return v

    @staticmethod
    def light(v):
        keys = ["id", "pool", "name", "linkedin_url", "current_title", "current_company", "city", "state", "standard_title",
                "title_match", "role_category", "experience_bucket", "total_experience_years", "domain_experience_years",
                "certifications", "open_to_work", "data_status", "percent", "updated_at", "updated_by",
                "first_seen", "source_flow"]
        out = {k: v.get(k) for k in keys}
        out["has_email"] = scoring.has_value("email", v.get("email"))
        out["has_phone"] = scoring.has_value("phone", v.get("phone"))
        return out

    def all_views(self, user_id=None):
        docs = self.docs()
        ver = self._ver
        if self._views and self._views[0] == ver:
            return self._views[1]
        fields = self.fields()
        views = [self.view(cid, d, fields) for cid, d in docs.items()]
        self._views = (ver, views)
        return views

    # ---------- list + filters + KPI cards ----------
    def search(self, p, user_id):
        views = self.all_views(user_id)
        pool = p.get("pool") or ""
        in_pool = [v for v in views if not pool or v["pool"] == pool]
        q = (p.get("q") or "").lower().strip()
        min_s, max_s = int(p.get("min_score") or 0), int(p.get("max_score") or 100)
        days = int(p.get("updated_within") or 0)
        since = (dt.datetime.now(IST) - dt.timedelta(days=days)).date().isoformat() if days else ""
        yes = lambda k: str(p.get(k) or "").lower() in ("1", "true", "yes")

        def ok(v):
            if q and q not in " ".join(str(v.get(k) or "") for k in ("name", "current_title", "current_company", "city", "skills",
                                                                       "modules_specialization", "certifications", "standard_title")).lower():
                return False
            for key, field in (("city", "city"), ("role", "role_category"), ("bucket", "experience_bucket"),
                               ("data_status", "data_status")):
                if p.get(key) and str(v.get(field) or "") != p[key]:
                    return False
            if not (min_s <= v["percent"] <= max_s):
                return False
            if yes("open_to_work") and v.get("open_to_work") != "Yes":
                return False
            if yes("certified") and not scoring.has_value("certifications", v.get("certifications")):
                return False
            if yes("has_email") and not scoring.has_value("email", v.get("email")):
                return False
            if yes("has_phone") and not scoring.has_value("phone", v.get("phone")):
                return False
            if yes("in_role") and v.get("title_match") != "Exact":
                return False
            if since and str(v["updated_at"])[:10] < since:
                return False
            if p.get("source") and p["source"].lower() not in str(v.get("source_flow") or "").lower():
                return False
            if p.get("first_seen") and str(v.get("first_seen") or "")[:10] != p["first_seen"]:
                return False
            return True

        rows = [v for v in in_pool if ok(v)]
        sort = p.get("sort") or "updated"
        keyf = {"updated": lambda v: str(v["updated_at"]), "name": lambda v: str(v.get("name") or "").lower(),
                "score": lambda v: v["percent"], "exp": lambda v: v.get("domain_experience_years") or 0,
                "first_seen": lambda v: str(v.get("first_seen") or "")}.get(sort, lambda v: str(v["updated_at"]))
        rows.sort(key=keyf, reverse=(p.get("dir", "desc") == "desc"))
        size = min(max(int(p.get("size") or 24), 1), 200)
        page = max(int(p.get("page") or 1), 1)
        cnt = lambda key: sorted({str(v.get(key)) for v in in_pool if v.get(key)})
        cities = {}
        for v in in_pool:
            if v.get("city"):
                cities[v["city"]] = cities.get(v["city"], 0) + 1
        stats = {
            "total": len(rows), "pool_total": len(in_pool),
            "in_role": sum(1 for v in rows if v.get("title_match") == "Exact"),
            "enriched": sum(1 for v in rows if v["data_status"] in ("Enriched", "Refreshed")),
            "certified": sum(1 for v in rows if scoring.has_value("certifications", v.get("certifications"))),
            "open_to_work": sum(1 for v in rows if v.get("open_to_work") == "Yes"),
            "cities": len({v.get("city") for v in rows if v.get("city")}),
            "contactable": sum(1 for v in rows if scoring.has_value("email", v.get("email")) or scoring.has_value("phone", v.get("phone"))),
            "avg_percent": round(sum(v["percent"] for v in rows) / len(rows)) if rows else 0,
        }
        facets = {"cities": [c for c, _ in sorted(cities.items(), key=lambda x: -x[1])][:60], "roles": cnt("role_category"),
                  "buckets": [b for b in ("0-2", "2-5", "5-8", "8+", "Unknown") if any(v.get("experience_bucket") == b for v in in_pool)],
                  "data_status": DATA_STATUS}
        return {"items": [self.light(v) for v in rows[(page - 1) * size: page * size]], "page": page, "size": size,
                "pages": max(1, -(-len(rows) // size)), "stats": stats, "facets": facets}

    def export_rows(self, p, user_id):
        """Same filters as the list, all pages (for CSV download)."""
        out, page = [], 1
        while True:
            r = self.search({**p, "size": 200, "page": page}, user_id)
            out += r["items"]
            if page >= r["pages"]:
                break
            page += 1
        return out

    # ---------- one candidate ----------
    def get(self, cid, user_id):
        d = self.docs().get(cid)
        if not d:
            return None
        fields = self.fields()
        v = self.view(cid, d, fields)
        v["history"] = self.history(cid, d)
        v["fields"] = fields
        v["extra_fields"] = scoring.EXTRA_EDITABLE
        return v

    def history(self, cid, d):
        rows = [{"at": iso(a["at"]), "by": a.get("by_name") or "Website", "text": a["text"], "kind": "person"} for a in self.store.audit_for(cid)]
        if d.get("last_change"):
            rows.append({"at": str(d.get("last_checked") or ""), "by": "n8n refresh", "text": "LinkedIn change: " + str(d["last_change"]), "kind": "auto"})
        if str(d.get("readiness")) == "Enriched":
            rows.append({"at": str(d.get("last_updated") or ""), "by": "n8n enrichment", "text": "Full LinkedIn profile added (Discovered → Enriched)", "kind": "auto"})
        if d.get("first_seen"):
            rows.append({"at": str(d["first_seen"]), "by": str(d.get("source_flow") or "automation"), "text": "Candidate found" + (f" via search: {d['search_query']}" if d.get("search_query") else ""), "kind": "auto"})
        rows.sort(key=lambda r: r["at"], reverse=True)
        return rows

    def _cache_set(self, cid, fields):
        d = self.docs().get(cid)
        if d is None:
            return
        for k, v in fields.items():
            if "." in k:
                a, b = k.split(".", 1)
                d.setdefault(a, {})
                d[a][b] = v
            else:
                d[k] = v
        self._changed()

    def update_fields(self, cid, changes: dict, user: dict, base: str = ""):
        d = self.docs().get(cid)
        if not d:
            return {"error": "not_found"}
        fields = self.fields()
        allowed = {f["key"]: f for f in fields} | {f["key"]: f for f in scoring.EXTRA_EDITABLE}
        cur = self.view(cid, d, fields)
        if base and d.get("app_updated_at") and iso(d["app_updated_at"]) > base and d.get("app_updated_by_id") != user["id"]:
            return {"error": "conflict", "by": d.get("app_updated_by"), "at": iso(d["app_updated_at"])}
        sets, logs = {}, []
        for key, val in changes.items():
            f = allowed.get(key)
            if not f:
                return {"error": "bad_field", "field": key}
            val = val.strip() if isinstance(val, str) else val
            if f.get("type") == "number" and val not in ("", None):
                if num(val) is None:
                    return {"error": "bad_value", "field": key, "message": f"{f['label']} must be a number"}
                val = num(val)
            if f.get("options") and val not in ("", None) and val not in f["options"]:
                return {"error": "bad_value", "field": key, "message": f"{f['label']}: choose one of {', '.join(f['options'])}"}
            old = cur["custom"].get(key[7:]) if key.startswith("custom.") else cur.get(key)
            if str(old if old is not None else "") == str(val if val is not None else ""):
                continue
            target = key if key.startswith("custom.") else "manual." + key
            sets[target] = val
            sets[f"manual_meta.{key.replace('.', '_')}"] = {"by": user["name"], "at": now()}
            logs.append({"field": key, "old": old, "new": val, "label": f["label"]})
        if not sets:
            return {"ok": True, "changed": 0}
        stamp = now()
        sets.update({"app_updated_at": stamp, "app_updated_by": user["name"], "app_updated_by_id": user["id"]})
        self.store.candidate_set(d["_pool"], d["_id"], sets)
        self._cache_set(cid, sets)
        for l in logs:
            self.store.audit_add({"cand": cid, "at": stamp, "by": user["id"], "by_name": user["name"], "field": l["field"],
                                  "old": l["old"], "new": l["new"], "text": f"{l['label']}: {l['old'] or 'empty'} → {l['new'] or 'empty'}"})
        return {"ok": True, "changed": len(logs)}

    def set_hiring(self, cid, status, user):
        d = self.docs().get(cid)
        if not d:
            return {"error": "not_found"}
        if status not in HIRING:
            return {"error": "bad_value", "message": "Unknown hiring status"}
        fields = self.fields()
        v = self.view(cid, d, fields)
        if status == "Contacted" and not (scoring.has_value("email", v.get("email")) or scoring.has_value("phone", v.get("phone"))):
            return {"error": "rule", "message": "Add a phone or email before marking Contacted"}
        if status in ("Shortlisted", "Placed"):
            need = scoring.missing_for_shortlist(v, fields)
            if need:
                return {"error": "rule", "message": "Fill required fields first: " + ", ".join(need), "missing": need}
        old = v["hire_status"]
        if old == status:
            return {"ok": True}
        stamp = now()
        sets = {"hire_status": status, "hire_updated_at": stamp, "app_updated_at": stamp, "app_updated_by": user["name"], "app_updated_by_id": user["id"]}
        self.store.candidate_set(d["_pool"], d["_id"], sets)
        self._cache_set(cid, sets)
        self.store.audit_add({"cand": cid, "at": stamp, "by": user["id"], "by_name": user["name"], "field": "hire_status",
                              "old": old, "new": status, "text": f"Hiring status: {old} → {status}"})
        return {"ok": True}

    def create(self, pool_label, data, user):
        key = next((k for k, v in POOLS.items() if v == pool_label), None)
        if not key:
            return {"error": "bad_value", "message": "Choose a pool"}
        if not str(data.get("name") or "").strip() or "linkedin.com/in/" not in str(data.get("linkedin_url") or ""):
            return {"error": "bad_value", "message": "Name and a LinkedIn profile URL are required"}
        url = data["linkedin_url"].strip().lower().rstrip("/").replace("://in.linkedin.com", "://www.linkedin.com")
        if any(str(d.get("linkedin_url") or "").lower().rstrip("/") == url for d in self.docs().values()):
            return {"error": "duplicate", "message": "This LinkedIn profile is already in the database"}
        stamp, day = now(), today_ist()
        doc = {"pool": pool_label, "name": data["name"].strip(), "linkedin_url": url, "readiness": "Discovered",
               "source": "Added on website", "source_flow": "manual (website)", "first_seen": day, "last_updated": day,
               "manual": {k: v for k, v in data.items() if k not in ("pool",) and v not in ("", None)},
               "app_updated_at": stamp, "app_updated_by": user["name"], "app_updated_by_id": user["id"]}
        doc["manual"]["linkedin_url"] = url
        cid = self.store.candidate_insert(key, doc)
        full = f"{key}:{cid}"
        self.store.audit_add({"cand": full, "at": stamp, "by": user["id"], "by_name": user["name"], "field": "*", "old": None, "new": None,
                              "text": "Candidate added on the website"})
        self.invalidate()
        return {"ok": True, "id": full}

    # ---------- dashboard ----------
    def dashboard(self, user_id):
        views = self.all_views(user_id)
        t = today_ist()
        days = [(dt.datetime.now(IST).date() - dt.timedelta(days=i)).isoformat() for i in range(29, -1, -1)]
        series = {d: {"date": d, "ServiceNow": 0, "AI/ML": 0} for d in days}
        for v in views:
            f = str(v.get("first_seen") or "")[:10]
            if f in series:
                series[f][v["pool"]] = series[f].get(v["pool"], 0) + 1
        month_ago = days[0]
        by = lambda key, opts: {o: sum(1 for v in views if v[key] == o) for o in opts}
        recent = sorted(views, key=lambda v: str(v["updated_at"]), reverse=True)[:8]
        return {
            "total": len(views),
            "pools": {p: sum(1 for v in views if v["pool"] == p) for p in POOLS.values()},
            "added_today": sum(1 for v in views if str(v.get("first_seen") or "")[:10] == t),
            "enriched": sum(1 for v in views if v["data_status"] in ("Enriched", "Refreshed")),
            "enriched_today": sum(1 for v in views if self._enriched_on(v, t)),
            "refreshed_30d": sum(1 for v in views if str(v.get("last_checked") or "") >= month_ago),
            "avg_percent": round(sum(v["percent"] for v in views) / len(views)) if views else 0,
            "complete_90": sum(1 for v in views if v["percent"] >= 90),
            "daily": list(series.values()),
            "data_status": by("data_status", DATA_STATUS),
            "cities": self._top(views, "city", 7),
            "experience": {b: sum(1 for v in views if (v.get("experience_bucket") or "Unknown") == b) for b in ("0-2", "2-5", "5-8", "8+", "Unknown")},
            "recent": [self.light(v) for v in recent],
            "today": t,
        }

    @staticmethod
    def _top(views, key, n):
        c = {}
        for v in views:
            if v.get(key):
                c[v[key]] = c.get(v[key], 0) + 1
        return [{"label": k, "value": x} for k, x in sorted(c.items(), key=lambda i: -i[1])[:n]]

    @staticmethod
    def _enriched_on(v, day):
        if v.get("readiness") != "Enriched" and v["data_status"] not in ("Enriched", "Refreshed"):
            return False
        if f"Full profile scraped {day}" in str(v.get("notes") or ""):
            return True
        return str(v.get("last_updated") or "") == day and str(v.get("first_seen") or "") != day and not v.get("last_checked")

    def daily(self, day, user_id):
        views = self.all_views(user_id)
        base = dt.date.fromisoformat(day)
        span = [(base - dt.timedelta(days=i)).isoformat() for i in range(13, -1, -1)]
        def counts(d):
            new = [v for v in views if str(v.get("first_seen") or "")[:10] == d]
            return {"date": d,
                    "new": len(new),
                    "new_sn": sum(1 for v in new if v["pool"] == "ServiceNow"),
                    "new_ai": sum(1 for v in new if v["pool"] == "AI/ML"),
                    "enriched": sum(1 for v in views if self._enriched_on(v, d)),
                    "refreshed": sum(1 for v in views if str(v.get("last_checked") or "") == d),
                    "changed": sum(1 for v in views if str(v.get("last_change") or "").startswith(d)),
                    "new_auto": sum(1 for v in new if "python" not in str(v.get("source_flow") or "").lower())}
        today = counts(day)
        changes = [{"id": v["id"], "name": v.get("name"), "pool": v["pool"], "change": v.get("last_change")}
                   for v in views if str(v.get("last_change") or "").startswith(day)][:50]
        added = sorted([self.light(v) for v in views if str(v.get("first_seen") or "")[:10] == day], key=lambda x: x["pool"])[:50]
        def item(v, extra=None):
            x = self.light(v)
            x["readiness"] = v.get("readiness")
            if extra:
                x.update(extra)
            return x
        lists = {
            "new": [item(v) for v in views if str(v.get("first_seen") or "")[:10] == day],
            "enriched": [item(v) for v in views if self._enriched_on(v, day)],
            "refreshed": [item(v, {"change": v.get("last_change")}) for v in views if str(v.get("last_checked") or "") == day],
            "changed": [item(v, {"change": str(v.get("last_change") or "").replace(day + ":", "").strip()})
                        for v in views if str(v.get("last_change") or "").startswith(day)],
        }
        for k in lists:
            lists[k] = sorted(lists[k], key=lambda x: (x["pool"], -(x.get("percent") or 0)))[:500]
        return {"day": day, "summary": today, "series": [counts(d) for d in span], "runs": self.store.runs_on(day),
                "changes": changes, "added": added, "lists": lists}
