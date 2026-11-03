"""Smart search: turns a plain-English question into candidate filters, with no AI service needed.

  "salesforce developers in pune with 5+ years and email"
    -> {pool: Salesforce, role: Developer, city: Pune, min_exp: 5, has_email: 1}

Words that are not understood stay as free text (name, company, skill, module...)."""
import datetime as dt
import re

IST = dt.timezone(dt.timedelta(hours=5, minutes=30))

POOL_WORDS = [
    (r"\bservice\s?now\b|\bsnow\b", "ServiceNow"),
    (r"\bsales\s?force\b|\bsfdc\b", "Salesforce"),
    (r"\bwork\s?day\b", "Workday"),
    (r"\bai\s*/\s*ml\b|\bai\s*ml\b|\bai\b|\bml\b|machine learning|gen\s?ai|\bllm\b|data scien\w*|deep learning|\bnlp\b|computer vision|mlops", "AI/ML"),
]
CITY_ALIAS = {"bangalore": "Bengaluru", "bengaluru": "Bengaluru", "gurgaon": "Gurugram", "bombay": "Mumbai", "new delhi": "Delhi",
              "madras": "Chennai", "cochin": "Kochi", "trivandrum": "Thiruvananthapuram", "mysore": "Mysuru", "bay area": "San Francisco Bay Area",
              "san francisco": "San Francisco Bay Area", "sf bay area": "San Francisco Bay Area", "nyc": "New York", "ny": "New York"}
COUNTRY_ALIAS = {"usa": "United States", "us": "United States", "u.s.": "United States", "america": "United States", "united states": "United States",
                 "uk": "United Kingdom", "u.k.": "United Kingdom", "england": "United Kingdom", "britain": "United Kingdom",
                 "uae": "United Arab Emirates", "emirates": "United Arab Emirates", "india": "India", "canada": "Canada", "australia": "Australia",
                 "singapore": "Singapore", "germany": "Germany", "ireland": "Ireland", "netherlands": "Netherlands"}
ROLE_WORDS = [  # (pattern, role_category value as the data stores it); multi-word ones first
    (r"\bintegration (developers?|consultants?|engineers?|specialists?)\b|\bintegrations?\b", "Integration"),
    (r"\bgen\s?ai engineers?\b|\bllm engineers?\b|\bgen\s?ai\b", "GenAI"),
    (r"\bdata scientists?\b|\bdata science\b", "Data Science"),
    (r"\bbusiness analysts?\b|\bba\b", "BA"),
    (r"\bpayroll\b", "Payroll"),
    (r"\bfinancials?\b", "Financials"),
    (r"\breport(ing)? (writers?|analysts?)\b", "Reporting"),
    (r"\bdevelopers?\b|\bdevs?\b|\bprogrammers?\b", "Developer"),
    (r"\badmins?\b|\badministrators?\b", "Administrator"),
    (r"\barchitects?\b", "Architect"),
    (r"\bconsultants?\b", "Consultant"),
    (r"\btesters?\b|\bqa\b|\bquality\b", "Tester"),
    (r"\banalysts?\b", "Analyst"),
    (r"\btech leads?\b|\bleads?\b|\bmanagers?\b", "Lead"),
]
FLAGS = [
    (r"\be-?mails?( ids?| address(es)?)?\b", "has_email", "has email"),
    (r"\b(phone|mobile|contact)( numbers?| no\.?)?\b", "has_phone", "has phone"),
    (r"\bcertified\b|\bcertifications?\b", "certified", "certified"),
    (r"\bopen to work\b|\blooking for (a )?(job|work|change)\b|\bimmediate joiners?\b|\bavailable\b", "open_to_work", "open to work"),
    (r"\bin role\b|\bcurrently working\b", "in_role", "in role now"),
]
STATUS = [(r"\benriched\b|\bfull profiles?\b", "Enriched"), (r"\brefreshed\b", "Refreshed"), (r"\brejected\b", "Rejected"),
          (r"\bdiscovered\b|\bnot enriched\b", "Discovered")]
STOP = set("""show me find get give list search all any the a an of in at from with and or who whose which that are is be
candidates candidate people persons person profiles profile talent someone please for to on near based living working work
experience exp years year yrs yr plus more than least over above minimum min having has have""".split())


def _num(s):
    return float(s) if "." in s else int(s)


def parse(text, cities=(), countries=()):
    """-> {"params": {...filters for /candidates}, "chips": [readable pieces], "text": leftover words}"""
    q = " " + re.sub(r"\s+", " ", str(text or "").lower()).strip() + " "
    params, chips = {}, []

    def take(pattern):
        nonlocal q
        m = re.search(pattern, q)
        if m:
            q = q[:m.start()] + " " + q[m.end():]
        return m

    # experience: "5+ years", "more than 5 years", "at least 3 yrs", "5 years", "between 3 and 6 years"
    m = take(r"(?:between|from)\s+(\d+(?:\.\d+)?)\s*(?:and|to|-)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)?(?: of)?(?: experience| exp)?")
    if m:
        params["min_exp"], params["max_exp"] = _num(m.group(1)), _num(m.group(2))
        chips.append(f"{m.group(1)}–{m.group(2)} yrs")
    else:
        m = take(r"(?:more than|over|above|at least|min(?:imum)?|>=?)\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)?(?: of)?(?: experience| exp)?") \
            or take(r"(\d+(?:\.\d+)?)\s*\+\s*(?:years?|yrs?)?(?: of)?(?: experience| exp)?") \
            or take(r"(\d+(?:\.\d+)?)\s*(?:years?|yrs?)(?: of)?(?: experience| exp)?")
        if m:
            params["min_exp"] = _num(m.group(1))
            chips.append(f"{m.group(1)}+ yrs")
        else:
            m = take(r"(?:less than|under|below|up to|max(?:imum)?)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)?(?: of)?(?: experience| exp)?")
            if m:
                params["max_exp"] = _num(m.group(1))
                chips.append(f"up to {m.group(1)} yrs")
    if take(r"\bfreshers?\b|\bjuniors?\b|\bentry level\b"):
        params["bucket"] = "0-2"; chips.append("0-2 yrs")
    elif take(r"\bseniors?\b|\bexperienced\b"):
        if "min_exp" not in params:
            params["min_exp"] = 5; chips.append("5+ yrs")

    # dates
    today = dt.datetime.now(IST).date()
    if take(r"\b(found|added|new|scraped)?\s*today\b"):
        params["first_seen"] = today.isoformat(); chips.append("found today")
    elif take(r"\b(found|added|new|scraped)?\s*yesterday\b"):
        params["first_seen"] = (today - dt.timedelta(days=1)).isoformat(); chips.append("found yesterday")
    elif take(r"\b(this|last|past)\s+week\b|\blast 7 days\b"):
        params["updated_within"] = "7"; chips.append("updated this week")

    # flags + status (before roles, so "data scientists" etc. stay intact)
    for pat, key, label in FLAGS:
        if take(pat):
            params[key] = "1"; chips.append(label)
    for pat, val in STATUS:
        if take(pat):
            params["data_status"] = val; chips.append(val); break

    # roles (multi-word first), then pools
    for pat, val in ROLE_WORDS:
        if take(pat):
            params["role"] = val; chips.append(val); break
    for pat, _ in ROLE_WORDS:          # a second role word ("payroll consultants") is only part of the same role
        while take(pat):
            pass
    for pat, val in POOL_WORDS:
        if take(pat):
            params["pool"] = val; chips.insert(0, val); break
    take(r"\bengineers?\b|\bspecialists?\b|\bexperts?\b|\bprofessionals?\b")   # generic job words add nothing

    # places: country aliases, then known cities (longest name first)
    for alias in sorted(set(COUNTRY_ALIAS) | {c.lower() for c in countries}, key=len, reverse=True):
        if take(r"(?<![\w.])" + re.escape(alias) + r"(?![\w.])"):
            params["country"] = COUNTRY_ALIAS.get(alias) or next(c for c in countries if c.lower() == alias); chips.append(params["country"]); break
    names = {c.lower(): c for c in cities}
    for alias in sorted(set(CITY_ALIAS) | set(names), key=len, reverse=True):
        if take(r"\b" + re.escape(alias) + r"\b"):
            params["city"] = CITY_ALIAS.get(alias) or names[alias]; chips.append(params["city"]); break

    # sort hints
    if take(r"\b(best|top|most complete|complete)\b"):
        params["sort"] = "score"
    elif take(r"\bmost experienced\b"):
        params["sort"] = "exp"

    rest = " ".join(w for w in re.findall(r"[\w.+#/-]+", q) if w not in STOP and not w.isdigit())
    if rest:
        params["q"] = rest
    return {"params": params, "chips": chips, "text": rest}
