"""Profile completeness: every field has points; missing fields lower the %.
Weights and custom fields can be changed by an admin (stored in the settings collection)."""
import re

PERSONAL = re.compile(r"@(gmail|yahoo|outlook|hotmail|rediffmail|icloud|live|protonmail)\.", re.I)

# key = field in the candidate document; must = needed before "Shortlisted"
DEFAULT_FIELDS = [
    {"key": "phone", "label": "Phone", "group": "Contact", "points": 15, "must": True, "why": "Candidate ko call nahi kar sakte"},
    {"key": "email", "label": "Email", "group": "Contact", "points": 14, "must": True, "why": "Email outreach nahi ho sakta", "type": "email"},
    {"key": "domain_experience_years", "label": "Domain experience (yrs)", "group": "Experience", "points": 10, "must": True, "why": "Role ke liye fit check nahi ho sakta", "type": "number"},
    {"key": "total_experience_years", "label": "Total experience (yrs)", "group": "Experience", "points": 8, "must": False, "why": "Seniority tay nahi ho sakti", "type": "number"},
    {"key": "current_title", "label": "Current title", "group": "Experience", "points": 7, "must": True, "why": "Abhi kya kaam karte hain, pata nahi"},
    {"key": "current_company", "label": "Current company", "group": "Experience", "points": 4, "must": False, "why": "Employer pata nahi"},
    {"key": "linkedin_url", "label": "LinkedIn URL", "group": "Contact", "points": 10, "must": True, "why": "Profile verify nahi ho sakti", "type": "url"},
    {"key": "name", "label": "Full name", "group": "Contact", "points": 5, "must": True, "why": "Pehchaan adhoori"},
    {"key": "city", "label": "City", "group": "Contact", "points": 6, "must": True, "why": "Location match nahi ho sakti"},
    {"key": "skills", "label": "Skills", "group": "Skills", "points": 6, "must": False, "why": "Skill match nahi ho sakta"},
    {"key": "modules_specialization", "label": "Modules / specialization", "group": "Skills", "points": 6, "must": False, "why": "Module expertise pata nahi"},
    {"key": "certifications", "label": "Certifications", "group": "Skills", "points": 6, "must": False, "why": "Certified hai ya nahi, pata nahi"},
    {"key": "open_to_work", "label": "Open to work", "group": "Contact", "points": 3, "must": False, "why": "Job change interest pata nahi", "options": ["Yes", "No", "Unknown"]},
]

# extra editable fields that carry no points
EXTRA_EDITABLE = [
    {"key": "standard_title", "label": "Standard title", "group": "Experience"},
    {"key": "seniority", "label": "Seniority", "group": "Experience", "options": ["Intern", "Junior", "Mid", "Senior", "Lead", "Manager"]},
    {"key": "state", "label": "State", "group": "Contact"},
    {"key": "past_employers", "label": "Past employers", "group": "Background", "type": "textarea"},
    {"key": "notes", "label": "Education & notes", "group": "Background", "type": "textarea"},
]


def empty(v) -> bool:
    return v is None or (isinstance(v, str) and v.strip() in ("", "-", "Not found", "Not collected"))


def has_value(key, v) -> bool:
    if empty(v):
        return False
    if key == "open_to_work" and str(v).strip().lower() == "unknown":
        return False
    if key == "consent" and str(v).strip().lower() != "yes":
        return False
    return True


def all_fields(settings: dict) -> list[dict]:
    weights = settings.get("weights", {})
    out = []
    for f in DEFAULT_FIELDS:
        g = dict(f)
        if f["key"] in weights:
            g["points"] = int(weights[f["key"]].get("points", g["points"]))
            g["must"] = bool(weights[f["key"]].get("must", g["must"]))
        out.append(g)
    for c in settings.get("custom_fields", []):
        out.append({"key": "custom." + c["key"], "label": c["label"], "group": "Custom", "points": int(c.get("points", 0)),
                    "must": bool(c.get("must")), "why": c.get("why") or f"{c['label']} missing", "type": c.get("type", "text"),
                    "options": c.get("options") or None, "custom": True})
    return out


def score(view: dict, fields: list[dict]) -> dict:
    """view = candidate with manual edits already applied. Returns percent + what is missing."""
    total = sum(f["points"] for f in fields) or 1
    got, missing = 0, []
    for f in fields:
        v = view.get("custom", {}).get(f["key"][7:]) if f.get("custom") else view.get(f["key"])
        if not has_value(f["key"], v):
            if f["points"] or f["must"]:
                missing.append({"key": f["key"], "label": f["label"], "lost": f["points"], "why": f["why"], "must": f["must"]})
            continue
        if f["key"] == "email" and not PERSONAL.search(str(v)):
            half = f["points"] // 2
            got += half
            missing.append({"key": "email", "label": "Personal email", "lost": f["points"] - half, "must": False,
                            "why": "Sirf company email hai; personal email se aur points milenge"})
            continue
        got += f["points"]
    missing.sort(key=lambda m: -m["lost"])
    return {"percent": round(got / total * 100), "missing": missing}


def missing_for_shortlist(view: dict, fields: list[dict]) -> list[str]:
    out = []
    for f in fields:
        if not f["must"]:
            continue
        v = view.get("custom", {}).get(f["key"][7:]) if f.get("custom") else view.get(f["key"])
        if not has_value(f["key"], v):
            out.append(f["label"])
    return out
