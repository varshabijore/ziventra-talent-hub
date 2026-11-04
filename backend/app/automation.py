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
    # fast mode (4 Nov 2026): every hour
    "Scraping": [f"{h:02d}:12" for h in range(24)],
    "Enrichment": [f"{h:02d}:41" for h in range(24)],
    "Refresh": [],  # paused: its credits go to enrichment
    "Sync": [f"{h:02d}:55" for h in range(24)],
    "Apollo": [],  # manual: started by hand in n8n (few credits)
    "Treg": ["12:11", "15:11", "18:11"],  # up to 200 per run: clears the backlog, then only new enriched candidates
}
# Jobs that are switched off on purpose (shown as "Paused" instead of "Missed")
PAUSED = {"Refresh": "Paused for now: its Apify credits are used for enrichment. Most profiles are newer than 30 days, so there is nothing to re-check yet.",
          "Apollo": "Monthly credit limit reached on the current Apollo plan. Credits renew on 27 Nov 2026; phone lookups resume once credits are available."}
JOBS = ["Scraping", "Enrichment", "Refresh", "Apollo", "Treg", "Sync"]
WHAT = {
    "Scraping": "Finds new LinkedIn profiles through Google search (Apify) and adds them to the sheet",
    "Enrichment": "Scrapes the full LinkedIn profile for Discovered candidates; every 3rd hour it also searches emails for the top candidates",
    "Refresh": "Re-checks enriched profiles older than 30 days for LinkedIn changes",
    "Sync": "Copies the master sheet into MongoDB (what this website reads)",
    "Apollo": "Finds the personal mobile number from Apollo (run by hand, limited credits)",
    "Treg": "Finds work and personal email through Treg for enriched candidates (up to 200 per run)",
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
    if "apollo" in s:
        return "Apollo"
    if "treg" in s:
        return "Treg"
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
         "cost": _float(d.get("cost")), "notes": notes, "issues": [], "info": "", "error": d.get("error") or ""}
    added = str(d.get("added", ""))
    r["queries"] = _int(d.get("queries"))
    r["google_results"] = _int(d.get("google_results"))
    r["found"] = _int(d.get("found"))
    r["rejected"] = _int(d.get("rejected"))
    m = re.search(r"(\d+)\s*ServiceNow\s*\+\s*(\d+)\s*AI/ML", notes)
    r["new_sn"], r["new_ai"] = (int(m.group(1)), int(m.group(2))) if m else (0, 0)
    m3 = re.search(r"(\d+)\s*Salesforce\s*\+\s*(\d+)\s*Workday", notes)
    r["new_sf"], r["new_wd"] = (int(m3.group(1)), int(m3.group(2))) if m3 else (0, 0)
    rg = re.search(r"Region:\s*(\w+)", notes)
    r["region"] = rg.group(1) if rg else ""
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
    r["matched"] = r["emails_added"] = r["credits"] = r["work_found"] = r["personal_found"] = 0
    if job == "Scraping":
        r["new"] = _int(added) if added else (r["new_sn"] + r["new_ai"] + r["new_sf"] + r["new_wd"] or _int(notes))
        if not r["found"] and r["new"]:
            r["found"] = r["new"] + r["rejected"]
    elif job == "Enrichment":
        r["enriched"] = _int(added) if added else _int(notes)
        if not r["found"]:
            r["found"] = r["enriched"] + r["rejected"] + r["scrape_failed"]
    elif job == "Apollo":
        m2 = re.search(r"(\d+)\s*matched of\s*(\d+)", notes)
        r["matched"] = _int(d.get("matched")) if d.get("matched") is not None else (int(m2.group(1)) if m2 else _int(added))
        if not r["found"] and m2:
            r["found"] = int(m2.group(2))
        ea = re.search(r"Added to sheet:\s*(\d+)", notes)
        r["emails_added"] = _int(d.get("emails_added")) if d.get("emails_added") is not None else (int(ea.group(1)) if ea else 0)
        cr = re.search(r"Credits\s*~?(\d+)", notes)
        r["credits"] = _int(d.get("credits")) if d.get("credits") is not None else (int(cr.group(1)) if cr else 0)
    elif job == "Treg":
        tw = re.search(r"Work emails:\s*(\d+),\s*personal emails:\s*(\d+)", notes)
        r["work_found"] = _int(d.get("work_found")) if d.get("work_found") is not None else (int(tw.group(1)) if tw else 0)
        r["personal_found"] = _int(d.get("personal_found")) if d.get("personal_found") is not None else (int(tw.group(2)) if tw else 0)
        ea = re.search(r"Added to sheet:\s*(\d+)", notes)
        r["emails_added"] = _int(d.get("emails_added")) if d.get("emails_added") is not None else (int(ea.group(1)) if ea else 0)
        tc = re.search(r"(\d+)\s*checked", notes)
        r["checked"] = _int(d.get("checked")) if d.get("checked") is not None else (int(tc.group(1)) if tc else r["found"])
        r["found"] = r["found"] or r["checked"]
    elif job == "Sync":
        r["synced"] = _int(d.get("synced") or added or notes)

    # what went wrong (shown on the page)
    iss = r["issues"]
    if r["error"]:
        iss.append(str(r["error"])[:200])
    if job == "Scraping":
        if r["new"] == 0:
            iss.append("No new candidates were added")
        if r["found"] and r["duplicates"] / r["found"] > 0.75:
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
    elif job == "Apollo" and not r["error"]:
        if r["found"] and r["matched"] == 0:
            iss.append("Apollo did not match any of the candidates")
        em = re.search(r"Error:\s*(.+)$", notes)
        if em:
            iss.append("Apollo error: " + em.group(1)[:160])
    elif job == "Treg" and not r["error"]:
        if r["checked"] and r["work_found"] + r["personal_found"] == 0:
            iss.append("Treg found no emails for these candidates")
        em = re.search(r"Error:\s*(.+)$", notes)
        if em and r["work_found"] + r["personal_found"] > 0:
            # some lookups failed (e.g. a slow provider timed out) but the run worked; those candidates are retried next run
            r["info"] = ("Some lookups timed out (" if "timeout" in em.group(1).lower() else "Some lookups failed (") + em.group(1)[:120] + \
                "). Those candidates were left unchanged and are retried on the next run."
        elif em:
            iss.append("Treg error: " + em.group(1)[:160])
    elif job == "Refresh" and r["checked"] == 0 and not r["error"]:
        iss.append("Refresh ran but checked 0 profiles")
    r["status"] = "error" if r["error"] else "warning" if iss else "ok"
    # fields the Daily record page uses
    split = " + ".join(f"{n} {lbl}" for n, lbl in ((r["new_sn"], "ServiceNow"), (r["new_ai"], "AI/ML"), (r["new_sf"], "Salesforce"), (r["new_wd"], "Workday")) if n or lbl in ("ServiceNow", "AI/ML"))
    r["result"] = (f"{r['new']} new ({split})" if job == "Scraping"
                   else f"{r['enriched']} enriched, {r['rejected']} rejected" if job == "Enrichment"
                   else f"{r['checked']} checked, {r['changed']} changed" if job == "Refresh"
                   else f"{r['matched']} matched, {r['emails_added']} emails added, ~{r['credits']} credits" if job == "Apollo"
                   else f"{r['checked']} checked: {r['work_found']} work + {r['personal_found']} personal emails, ${r['cost']}" if job == "Treg"
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
CONTACT_JOBS = ["Apollo", "Treg"]  # shown on the "Contacts" tab


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

    jobs = [_card(job, runs, allruns, now, ndays) for job in SHOWN_JOBS]

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
                   "new_ai": sum(r["new_ai"] for r in runs), "new_sf": sum(r["new_sf"] for r in runs),
                   "new_wd": sum(r["new_wd"] for r in runs), "enriched": sum(r["enriched"] for r in runs),
                   "checked": sum(r["checked"] for r in runs), "changed": sum(r["changed"] for r in runs),
                   "cost": round(sum(r["cost"] for r in runs), 2),
                   "issues": sum(1 for r in runs if r["status"] != "ok") + len(missed) + len(errors),
                   "dup_rate": round(100 * sum(r["duplicates"] for r in scr) / found_all) if found_all else 0,
                   "emails_valid": sum(r["emails_valid"] for r in runs), "emails_risky": sum(r["emails_risky"] for r in runs),
                   "scrape_failed": sum(r["scrape_failed"] for r in runs), "reasons": reasons,
                   "apollo_matched": sum(r["matched"] for r in runs), "apollo_credits": sum(r["credits"] for r in runs)},
        "jobs": jobs, "series": series, "runs": runs[:300], "issues": issues, "missed": missed, "errors": errors[:50],
    }


def _card(job, runs, allruns, now, ndays):
    """One job card: what it did on the chosen days + its latest run ever."""
    mine = [r for r in runs if r["job"] == job]
    ever = [r for r in allruns if r["job"] == job]
    last = ever[0] if ever else None
    ok = sum(1 for r in mine if r["status"] == "ok")
    out = {"Scraping": "new", "Enrichment": "enriched", "Apollo": "matched", "Treg": "emails_added"}.get(job, "checked")
    return {
        "job": job, "what": WHAT[job], "paused": PAUSED.get(job, ""), "schedule": SCHEDULE[job], "next_run": _next_run(job, now),
        "logged": bool(ever), "runs": len(mine), "ok": ok, "expected": len(SCHEDULE[job]) * ndays,
        "health": round(100 * ok / len(mine)) if mine else None,
        "last": {k: last[k] for k in ("run_at", "date", "time", "status", "result", "issues", "info", "new", "new_sn", "new_ai", "new_sf", "new_wd",
                                       "enriched", "checked", "changed", "emails_valid", "found", "duplicates", "cost", "matched",
                                       "emails_added", "credits", "work_found", "personal_found")} if last else None,
        "output": sum(r[out] for r in mine),
        "credits": sum(r["credits"] for r in mine),
        "cost": round(sum(r["cost"] for r in mine), 3),
        "warnings": sum(1 for r in mine if r["status"] != "ok"),
    }


def _has(v):
    return bool(str(v or "").strip()) and str(v).strip().lower() not in ("not found", "requested", "-", "none")


def contacts(runs_raw, people, start, end):
    """The Contacts tab: Apollo (phone) + Treg (email) runs and what they found per candidate."""
    now = _now()
    d0, d1 = sorted([dt.date.fromisoformat(start), dt.date.fromisoformat(end)])
    start, end = d0.isoformat(), d1.isoformat()
    ndays = (d1 - d0).days + 1
    allruns = sorted((parse(x) for x in runs_raw), key=lambda r: r["run_at"], reverse=True)
    allruns = [r for r in allruns if r["job"] in CONTACT_JOBS]
    runs = [r for r in allruns if start <= r["date"] <= end]
    rows = []
    for v in people:
        a_at, t_at = str(v.get("apollo_checked_at") or "")[:16], str(v.get("treg_checked_at") or "")[:16]
        a_in, t_in = start <= a_at[:10] <= end if a_at else False, start <= t_at[:10] <= end if t_at else False
        if not (a_in or t_in):
            continue
        rows.append({"id": v["id"], "name": v.get("name"), "pool": v.get("pool"), "title": v.get("current_title") or "",
                     "checked_at": max(a_at if a_in else "", t_at if t_in else ""),
                     "apollo": {"status": v.get("apollo_status"), "phone": v.get("apollo_phone") or "", "email": v.get("apollo_email") or "",
                                "email_status": v.get("apollo_email_status") or "", "personal": v.get("apollo_personal_email") or "", "at": a_at} if a_in else None,
                     "treg": {"status": v.get("treg_status"), "work": v.get("treg_work_email") or "", "verified": v.get("treg_work_verified") == "yes",
                              "personal": v.get("treg_personal_email") or "", "by": v.get("treg_served_by") or "", "cost": v.get("treg_cost") or 0, "at": t_at} if t_in else None,
                     "email": v.get("email") or "", "email_status": v.get("email_status") or "", "phone": v.get("phone") or ""})
    rows.sort(key=lambda x: x["checked_at"], reverse=True)
    ap = [x["apollo"] for x in rows if x["apollo"]]
    tr = [x["treg"] for x in rows if x["treg"]]
    return {
        "start": start, "end": end, "days": ndays, "today": now.date().isoformat(),
        "jobs": [_card(j, runs, allruns, now, ndays) for j in CONTACT_JOBS],
        "totals": {"checked": len(rows), "apollo_checked": len(ap), "phones": sum(1 for a in ap if _has(a["phone"]) and a["phone"][:1] in "+0123456789"),
                   "phones_pending": sum(1 for a in ap if a["phone"] == "requested"),
                   "apollo_credits": sum(r["credits"] for r in runs if r["job"] == "Apollo"),
                   "treg_checked": len(tr), "work": sum(1 for t in tr if _has(t["work"])), "work_verified": sum(1 for t in tr if t["verified"]),
                   "personal": sum(1 for t in tr if _has(t["personal"])) + sum(1 for a in ap if _has(a["personal"])),
                   "treg_cost": round(sum(r["cost"] for r in runs if r["job"] == "Treg"), 3),
                   "emails_added": sum(r["emails_added"] for r in runs)},
        "runs": runs[:300], "people": rows[:1000],
    }
