"""n8n automation monitor: turns the run log (talent_app.runs) and workflow errors (talent_app.n8n_errors)
into the numbers shown on the Automation page.

A run log document can look like either of these (both are understood):
  new style (same columns as the sheet's "runs" tab, written by n8n):
    {"run_at": "2026-11-02 10:12", "flow": "n8n (scheduled)", "queries": 15, "google_results": 123,
     "found": 20, "rejected": 8, "added": "12", "cost": 0.067, "notes": "7 ServiceNow + 5 AI/ML. Rejected: ..."}
  old style: {"date": "2026-11-02", "time": "10:12", "job": "Scraping", "result": "...", "cost": 0.07}
"""
import datetime as dt
import re

IST = dt.timezone(dt.timedelta(hours=5, minutes=30))

# When each n8n workflow is scheduled (IST). Used for "next run" and "missed run".
SCHEDULE = {
    "Scraping": ["10:12", "13:12", "16:12", "18:12"],
    "Enrichment": ["11:41", "18:41"],
    "Refresh": ["15:41", "20:41"],
    "Sync": ["10:45", "13:45", "16:45", "19:45"],
}
JOBS = ["Scraping", "Enrichment", "Refresh", "Sync"]
WHAT = {
    "Scraping": "Finds new LinkedIn profiles through Google search (Apify) and adds them to the sheet",
    "Enrichment": "Scrapes the full LinkedIn profile + email for Discovered candidates",
    "Refresh": "Re-checks enriched profiles older than 30 days for LinkedIn changes",
    "Sync": "Copies the master sheet into MongoDB (what this website reads)",
}


def _int(v):
    m = re.search(r"-?\d+", str(v if v is not None else ""))
    return int(m.group()) if m else 0


def _float(v):
    try:
        return round(float(str(v).strip()), 4)
    except (TypeError, ValueError):
        return 0.0


def job_of(flow, job=""):
    s = f"{job} {flow}".lower()
    if "enrich" in s:
        return "Enrichment"
    if "refresh" in s:
        return "Refresh"
    if "sync" in s or "mongo" in s:
        return "Sync"
    return "Scraping"


def parse(doc):
    """One run log document -> clean run with numbers, status and issues."""
    d = {k: v for k, v in doc.items() if k != "_id"}
    run_at = str(d.get("run_at") or f"{d.get('date', '')} {d.get('time', '')}").strip()
    date, _, time = run_at.partition(" ")
    time = time[:5]
    notes = str(d.get("notes") or d.get("result") or "")
    job = job_of(d.get("flow", ""), d.get("job", ""))
    r = {"run_at": f"{date} {time}".strip(), "date": date, "time": time, "job": job,
         "source": "claude" if "claude" in str(d.get("flow", "")).lower() else "n8n",
         "cost": _float(d.get("cost")), "notes": notes, "issues": [], "error": d.get("error") or ""}
    added = str(d.get("added", ""))
    r["queries"] = _int(d.get("queries"))
    r["google_results"] = _int(d.get("google_results"))
    r["found"] = _int(d.get("found"))
    r["rejected"] = _int(d.get("rejected"))
    m = re.search(r"(\d+)\s*ServiceNow\s*\+\s*(\d+)\s*AI/ML", notes)
    r["new_sn"], r["new_ai"] = (int(m.group(1)), int(m.group(2))) if m else (0, 0)
    reasons = {k: int(v) for k, v in re.findall(r"(not_india|wrong_title|recruiter|no_name|duplicate)\s+(\d+)", notes)}
    r["reasons"] = reasons
    r["duplicates"] = reasons.get("duplicate", 0)
    em = re.search(r"Emails?:?\s*(\d+)\s*valid,\s*(\d+)\s*risky", notes, re.I)
    r["emails_valid"], r["emails_risky"] = (int(em.group(1)), int(em.group(2))) if em else (0, 0)
    sf = re.search(r"Scrape failed:\s*(\d+)", notes)
    r["scrape_failed"] = int(sf.group(1)) if sf else 0
    ch = re.search(r"(\d+)\s*checked,\s*(\d+)\s*changed", notes)
    r["checked"], r["changed"] = (int(ch.group(1)), int(ch.group(2))) if ch else (_int(d.get("checked")), _int(d.get("changed")))

    r["new"] = r["enriched"] = r["synced"] = 0
    if job == "Scraping":
        r["new"] = _int(added) if added else (r["new_sn"] + r["new_ai"] or _int(notes))
        if not r["found"] and r["new"]:
            r["found"] = r["new"] + r["rejected"]
    elif job == "Enrichment":
        r["enriched"] = _int(added) if added else _int(notes)
        if not r["found"]:
            r["found"] = r["enriched"] + r["rejected"] + r["scrape_failed"]
    elif job == "Sync":
        r["synced"] = _int(d.get("synced") or added or notes)

    # what went wrong (shown on the page)
    iss = r["issues"]
    if r["error"]:
        iss.append(str(r["error"])[:200])
    if job == "Scraping":
        if r["new"] == 0:
            iss.append("No new candidates were added")
        if r["found"] and r["duplicates"] / r["found"] > 0.5:
            iss.append(f"{round(100 * r['duplicates'] / r['found'])}% of results were duplicates; searches need new keywords or cities")
        if r["google_results"] >= 60 and r["found"] < 0.3 * r["google_results"]:
            iss.append(f"Only {r['found']} of {r['google_results']} Google results were usable LinkedIn profiles")
        if r["found"] and reasons.get("not_india", 0) / r["found"] > 0.25:
            iss.append(f"{reasons['not_india']} profiles were outside India")
    elif job == "Enrichment":
        if r["scrape_failed"] > max(2, 0.1 * (r["found"] or 25)):
            iss.append(f"{r['scrape_failed']} profile(s) could not be scraped")
        if r["found"] and r["enriched"] < 0.8 * r["found"]:
            iss.append(f"Only {r['enriched']} of {r['found']} profiles were enriched")
    elif job == "Refresh" and r["checked"] == 0 and not r["error"]:
        iss.append("Refresh ran but checked 0 profiles")
    r["status"] = "error" if r["error"] else "warning" if iss else "ok"
    # fields the Daily record page uses
    r["result"] = (f"{r['new']} new ({r['new_sn']} ServiceNow + {r['new_ai']} AI/ML)" if job == "Scraping"
                   else f"{r['enriched']} enriched, {r['rejected']} rejected" if job == "Enrichment"
                   else f"{r['checked']} checked, {r['changed']} changed" if job == "Refresh"
                   else f"{r['synced']} rows synced" if job == "Sync" else notes[:120])
    r["by"] = r["source"]
    return r


def _now():
    return dt.datetime.now(IST)


def _next_run(job, now):
    times = SCHEDULE.get(job, [])
    for day in (0, 1):
        d = (now + dt.timedelta(days=day)).date()
        for t in times:
            h, m = map(int, t.split(":"))
            at = dt.datetime(d.year, d.month, d.day, h, m, tzinfo=IST)
            if at > now:
                return at.strftime("%Y-%m-%d %H:%M")
    return ""


SHOWN_JOBS = ["Scraping", "Enrichment", "Refresh"]  # Sync is hidden until it writes a run log


def report(runs_raw, errors_raw, start, end):
    """Everything the Automation page shows for the days start..end (YYYY-MM-DD, IST)."""
    now = _now()
    today = now.date().isoformat()
    d0, d1 = dt.date.fromisoformat(start), dt.date.fromisoformat(end)
    if d1 < d0:
        d0, d1 = d1, d0
    start, end = d0.isoformat(), d1.isoformat()
    ndays = (d1 - d0).days + 1
    allruns = sorted((parse(x) for x in runs_raw), key=lambda r: r["run_at"], reverse=True)
    runs = [r for r in allruns if start <= r["date"] <= end and r["job"] in SHOWN_JOBS]

    errors = []
    for e in errors_raw:
        at = str(e.get("at") or "")
        if start <= at[:10] <= end:
            errors.append({"at": at[:16].replace("T", " "), "workflow": e.get("workflow", ""), "node": e.get("node", ""),
                           "message": str(e.get("message", ""))[:300], "url": e.get("url", "")})
    errors.sort(key=lambda e: e["at"], reverse=True)

    # missed runs (only checked for today): a scheduled time that passed 45+ min ago with no run near it
    missed = []
    logged_jobs = {r["job"] for r in allruns}
    if start <= today <= end:
        for job in SHOWN_JOBS:
            if job not in logged_jobs:
                continue
            for t in SCHEDULE[job]:
                h, m = map(int, t.split(":"))
                at = now.replace(hour=h, minute=m, second=0, microsecond=0)
                if at + dt.timedelta(minutes=45) > now:
                    continue
                near = [r for r in allruns if r["job"] == job and r["date"] == today and
                        abs((dt.datetime.strptime(r["run_at"], "%Y-%m-%d %H:%M").replace(tzinfo=IST) - at).total_seconds()) <= 75 * 60]
                if not near:
                    missed.append({"job": job, "time": t, "date": today})

    jobs = []
    for job in SHOWN_JOBS:
        mine = [r for r in runs if r["job"] == job]
        ever = [r for r in allruns if r["job"] == job]
        last = ever[0] if ever else None
        ok = sum(1 for r in mine if r["status"] == "ok")
        jobs.append({
            "job": job, "what": WHAT[job], "schedule": SCHEDULE[job], "next_run": _next_run(job, now),
            "logged": bool(ever), "runs": len(mine), "ok": ok, "expected": len(SCHEDULE[job]) * ndays,
            "health": round(100 * ok / len(mine)) if mine else None,
            "last": {k: last[k] for k in ("run_at", "date", "time", "status", "result", "issues", "new", "new_sn", "new_ai",
                                           "enriched", "checked", "changed", "emails_valid", "found", "duplicates", "cost")} if last else None,
            "output": sum(r["new"] if job == "Scraping" else r["enriched"] if job == "Enrichment" else r["checked"] for r in mine),
            "cost": round(sum(r["cost"] for r in mine), 3),
            "warnings": sum(1 for r in mine if r["status"] != "ok"),
        })

    span = [(d0 + dt.timedelta(days=i)).isoformat() for i in range(ndays)]
    series = []
    for d in span:
        rs = [r for r in runs if r["date"] == d]
        series.append({"date": d, "runs": len(rs), "new": sum(r["new"] for r in rs), "enriched": sum(r["enriched"] for r in rs),
                       "checked": sum(r["checked"] for r in rs), "cost": round(sum(r["cost"] for r in rs), 3),
                       "issues": sum(1 for r in rs if r["status"] != "ok")})
    scr = [r for r in runs if r["job"] == "Scraping"]
    found_all = sum(r["found"] for r in scr)
    reasons = {}
    for r in scr:
        for k, v in r["reasons"].items():
            reasons[k] = reasons.get(k, 0) + v
    issues = [{"run_at": r["run_at"], "job": r["job"], "status": r["status"], "issues": r["issues"]} for r in runs if r["issues"]][:60]
    return {
        "now": now.strftime("%Y-%m-%d %H:%M"), "start": start, "end": end, "days": ndays, "today": today,
        "totals": {"runs": len(runs), "new": sum(r["new"] for r in runs), "new_sn": sum(r["new_sn"] for r in runs),
                   "new_ai": sum(r["new_ai"] for r in runs), "enriched": sum(r["enriched"] for r in runs),
                   "checked": sum(r["checked"] for r in runs), "changed": sum(r["changed"] for r in runs),
                   "cost": round(sum(r["cost"] for r in runs), 2),
                   "issues": sum(1 for r in runs if r["status"] != "ok") + len(missed) + len(errors),
                   "dup_rate": round(100 * sum(r["duplicates"] for r in scr) / found_all) if found_all else 0,
                   "emails_valid": sum(r["emails_valid"] for r in runs), "emails_risky": sum(r["emails_risky"] for r in runs),
                   "scrape_failed": sum(r["scrape_failed"] for r in runs), "reasons": reasons},
        "jobs": jobs, "series": series, "runs": runs[:300], "issues": issues, "missed": missed, "errors": errors[:50],
    }
