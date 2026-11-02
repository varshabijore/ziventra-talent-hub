"""Candidates import / export: CSV and Excel files, column mapping, company logos."""
import base64
import csv
import io
import re

# ---------- export ----------
EXPORT_COLS = [
    ("name", "Name"), ("pool", "Pool"), ("linkedin_url", "LinkedIn URL"), ("current_title", "Current title"),
    ("current_company", "Current company"), ("city", "City"), ("state", "State"),
    ("total_experience_years", "Total experience (yrs)"), ("domain_experience_years", "Domain experience (yrs)"),
    ("experience_bucket", "Experience bucket"), ("seniority", "Seniority"), ("standard_title", "Standard title"),
    ("certifications", "Certifications"), ("skills", "Skills"), ("modules_specialization", "Modules / specialization"),
    ("email", "Email"), ("email_status", "Email status"), ("phone", "Phone"), ("phone_status", "Phone status"),
    ("open_to_work", "Open to work"), ("data_status", "Data status"), ("percent", "Profile %"),
    ("first_seen", "First found"), ("updated_at", "Last updated"),
]
CONTACT_KEYS = {"email", "email_status", "phone", "phone_status"}


def export_file(rows, fmt="csv", contact=True):
    cols = [(k, l) for k, l in EXPORT_COLS if contact or k not in CONTACT_KEYS]
    vals = [[_cell(r.get(k)) for k, _ in cols] for r in rows]
    if fmt == "xlsx":
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill
        wb = Workbook()
        ws = wb.active
        ws.title = "Candidates"
        ws.append([l for _, l in cols])
        for c in ws[1]:
            c.font = Font(bold=True, color="FFFFFF")
            c.fill = PatternFill("solid", fgColor="4F46E5")
        for v in vals:
            ws.append(v)
        for i, (k, l) in enumerate(cols, 1):
            width = max([len(l)] + [len(str(v[i - 1])) for v in vals[:300]])
            ws.column_dimensions[ws.cell(1, i).column_letter].width = min(48, max(10, width + 2))
        ws.freeze_panes = "B2"
        ws.auto_filter.ref = ws.dimensions
        out = io.BytesIO()
        wb.save(out)
        return out.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([l for _, l in cols])
    w.writerows(vals)
    return ("﻿" + buf.getvalue()).encode("utf-8"), "text/csv; charset=utf-8"


def _cell(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return int(v)
    s = str(v)
    return "" if s.strip() in ("-", "Not found", "Not collected") else s


# ---------- import ----------
IMPORTABLE = {  # field -> header words that mean it
    "name": ["name", "full name", "candidate name", "candidate"],
    "linkedin_url": ["linkedin", "linkedin url", "linkedin profile", "profile url", "linkedin link", "url"],
    "pool": ["pool", "category", "domain", "team"],
    "email": ["email", "email id", "mail", "e-mail", "email address", "personal email"],
    "phone": ["phone", "mobile", "contact", "contact number", "phone number", "mobile number", "contact no"],
    "current_title": ["current title", "title", "designation", "role", "current role", "job title", "position"],
    "current_company": ["current company", "company", "employer", "organisation", "organization", "company name"],
    "city": ["city", "location", "current location"],
    "state": ["state"],
    "total_experience_years": ["total experience", "experience", "total exp", "exp", "experience years", "total experience yrs", "years of experience"],
    "domain_experience_years": ["domain experience", "relevant experience", "servicenow experience", "ai ml experience", "domain experience yrs", "relevant exp"],
    "certifications": ["certifications", "certification", "certificates"],
    "skills": ["skills", "skill", "key skills"],
    "modules_specialization": ["modules", "specialization", "modules specialization"],
    "open_to_work": ["open to work", "open_to_work", "looking for job"],
    "standard_title": ["standard title"],
    "seniority": ["seniority", "level"],
    "past_employers": ["past employers", "previous companies", "previous employers"],
    "notes": ["notes", "education", "remarks", "comment", "comments"],
}
FIELD_LABELS = {
    "name": "Name", "linkedin_url": "LinkedIn URL", "pool": "Pool", "email": "Email", "phone": "Phone",
    "current_title": "Current title", "current_company": "Current company", "city": "City", "state": "State",
    "total_experience_years": "Total experience (yrs)", "domain_experience_years": "Domain experience (yrs)",
    "certifications": "Certifications", "skills": "Skills", "modules_specialization": "Modules / specialization",
    "open_to_work": "Open to work", "standard_title": "Standard title", "seniority": "Seniority",
    "past_employers": "Past employers", "notes": "Education & notes",
}
NUMBER = {"total_experience_years", "domain_experience_years"}
MAX_ROWS = 5000


def _norm(h):
    return re.sub(r"[^a-z0-9]+", " ", str(h or "").lower()).strip()


def guess_mapping(headers):
    """Header -> field ('' = ignore). Exact word match first, then 'contains'."""
    out, used = {}, set()
    for h in headers:
        n = _norm(h)
        hit = next((f for f, words in IMPORTABLE.items() if f not in used and (n == f.replace("_", " ") or n in words)), "")
        if not hit:
            hit = next((f for f, words in IMPORTABLE.items() if f not in used and any(len(w) > 3 and w in n for w in words)), "")
        out[h] = hit
        if hit:
            used.add(hit)
    return out


def read_file(filename, data_b64):
    """-> (headers, rows as list of dicts). Accepts .csv and .xlsx."""
    raw = base64.b64decode(data_b64.split(",", 1)[-1])
    if len(raw) > 8 * 1024 * 1024:
        raise ValueError("File is too large (max 8 MB)")
    name = str(filename or "").lower()
    if name.endswith((".xlsx", ".xlsm")):
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        ws = wb.active
        it = ws.iter_rows(values_only=True)
        headers = [str(h).strip() if h is not None else "" for h in next(it, [])]
        rows = []
        for r in it:
            if r is None or all(v in (None, "") for v in r):
                continue
            rows.append({headers[i]: ("" if v is None else str(v).strip()) for i, v in enumerate(r) if i < len(headers) and headers[i]})
            if len(rows) > MAX_ROWS:
                break
    elif name.endswith(".csv") or name.endswith(".txt"):
        text = None
        for enc in ("utf-8-sig", "cp1252", "latin-1"):
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        try:
            dialect = csv.Sniffer().sniff(text[:4000], delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel
        rd = csv.reader(io.StringIO(text), dialect)
        headers = [h.strip() for h in next(rd, [])]
        rows = []
        for r in rd:
            if not any(str(v).strip() for v in r):
                continue
            rows.append({headers[i]: str(v).strip() for i, v in enumerate(r) if i < len(headers) and headers[i]})
            if len(rows) > MAX_ROWS:
                break
    else:
        raise ValueError("Upload a .csv or .xlsx file")
    headers = [h for h in headers if h]
    if not headers:
        raise ValueError("The file has no header row")
    if len(rows) > MAX_ROWS:
        raise ValueError(f"Too many rows (max {MAX_ROWS} per file)")
    return headers, rows


def clean_url(u):
    u = str(u or "").strip()
    m = re.search(r"linkedin\.com/in/([^/?#\s]+)", u, re.I)
    return f"https://www.linkedin.com/in/{m.group(1).lower()}" if m else ""


def clean_pool(v, default):
    s = _norm(v)
    if "servicenow" in s.replace(" ", "") or s in ("sn", "snow"):
        return "ServiceNow"
    if s in ("ai", "ml", "ai ml", "aiml") or "machine" in s or "ai" in s.split():
        return "AI/ML"
    return default


def clean_row(row, mapping, default_pool):
    """-> (data dict with field keys, error or '')."""
    d = {}
    for h, f in mapping.items():
        if not f:
            continue
        v = str(row.get(h, "") or "").strip()
        if not v or v.lower() in ("-", "na", "n/a", "none", "null", "not found"):
            continue
        if f in NUMBER:
            m = re.search(r"\d+(?:\.\d+)?", v)
            if not m:
                continue
            v = float(m.group())
            v = int(v) if v.is_integer() else round(v, 1)
        elif f == "open_to_work":
            v = "Yes" if v.lower() in ("yes", "y", "true", "1") else "No" if v.lower() in ("no", "n", "false", "0") else "Unknown"
        elif f == "phone":
            v = re.sub(r"[^\d+]", "", v) if re.search(r"\d{7,}", re.sub(r"\D", "", v)) else ""
            if not v:
                continue
            if not v.startswith("+") and len(v) == 10:
                v = "+91" + v
        elif f == "email":
            v = v.lower()
            if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-z]{2,}", v):
                return d, f"Email looks wrong: {v}"
        d[f] = v
    d["linkedin_url"] = clean_url(d.get("linkedin_url"))
    d["pool"] = clean_pool(d.get("pool"), default_pool)
    if not d["linkedin_url"]:
        return d, "LinkedIn profile URL missing or not a linkedin.com/in/ link"
    if not d.get("name"):
        return d, "Name missing"
    return d, ""   # pool is checked by the caller: an existing candidate keeps its own pool


def template_csv():
    cols = ["name", "linkedin_url", "pool", "email", "phone", "current_title", "current_company", "city",
            "total_experience_years", "domain_experience_years", "certifications", "skills", "open_to_work", "notes"]
    ex = ["Priya Sharma", "https://www.linkedin.com/in/priya-sharma-example", "ServiceNow", "priya@example.com", "+919800000000",
          "ServiceNow Developer", "Infosys", "Pune", "5", "3.5", "CSA; CAD", "ITSM; Flow Designer", "Yes", "Referred by Rahul"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    w.writerow(ex)
    return ("﻿" + buf.getvalue()).encode("utf-8")


# ---------- company logos ----------
# Common employers -> website. The website then shows the company's icon (favicon); unknown companies get initials.
COMPANY_SITES = {
    "tcs": "tcs.com", "tata consultancy services": "tcs.com", "infosys": "infosys.com", "infosys bpm": "infosys.com",
    "wipro": "wipro.com", "hcltech": "hcltech.com", "hcl technologies": "hcltech.com", "hcl": "hcltech.com",
    "accenture": "accenture.com", "accenture in india": "accenture.com", "capgemini": "capgemini.com", "cognizant": "cognizant.com",
    "tech mahindra": "techmahindra.com", "ltimindtree": "ltimindtree.com", "lti mindtree": "ltimindtree.com", "ltm": "ltimindtree.com",
    "mindtree": "ltimindtree.com", "l&t infotech": "ltimindtree.com", "ibm": "ibm.com", "deloitte": "deloitte.com", "ey": "ey.com",
    "ernst & young": "ey.com", "kpmg": "kpmg.com", "pwc": "pwc.com", "genpact": "genpact.com", "mphasis": "mphasis.com",
    "hexaware technologies": "hexaware.com", "hexaware": "hexaware.com", "coforge": "coforge.com", "persistent systems": "persistent.com",
    "virtusa": "virtusa.com", "zensar technologies": "zensar.com", "ntt data": "nttdata.com", "dxc technology": "dxc.com",
    "microsoft": "microsoft.com", "google": "google.com", "amazon": "amazon.com", "amazon web services": "aws.amazon.com",
    "oracle": "oracle.com", "servicenow": "servicenow.com", "kyndryl": "kyndryl.com", "atos": "atos.net", "birlasoft": "birlasoft.com",
    "cgi": "cgi.com", "ust": "ust.com", "ust global": "ust.com", "jpmorgan chase & co.": "jpmorganchase.com", "jpmorganchase": "jpmorganchase.com",
    "jp morgan": "jpmorganchase.com", "goldman sachs": "goldmansachs.com", "wells fargo": "wellsfargo.com", "citi": "citigroup.com",
    "barclays": "barclays.com", "hsbc": "hsbc.com", "deutsche bank": "db.com", "ey gds": "ey.com", "nagarro": "nagarro.com",
    "epam systems": "epam.com", "globallogic": "globallogic.com", "sopra steria": "soprasteria.com", "fujitsu": "fujitsu.com",
    "dell technologies": "dell.com", "hp": "hp.com", "hewlett packard enterprise": "hpe.com", "cisco": "cisco.com", "sap": "sap.com",
    "adobe": "adobe.com", "salesforce": "salesforce.com", "pure storage": "purestorage.com", "flipkart": "flipkart.com",
    "reliance jio": "jio.com", "jio": "jio.com", "tata elxsi": "tataelxsi.com", "kpit": "kpit.com", "sonata software": "sonata-software.com",
    "quess corp": "quesscorp.com", "orange business": "orange-business.com", "volkswagen group digital solutions [india]": "volkswagen.com",
}


def company_domain(name, website=""):
    w = re.sub(r"^https?://(www\.)?", "", str(website or "")).split("/")[0].strip().lower()
    if w and "." in w and "linkedin.com" not in w:
        return w
    n = re.sub(r"\s+", " ", str(name or "").strip().lower()).strip(" .")
    if not n or n in ("-", "confidential", "self-employed", "freelance"):
        return ""
    if n in COMPANY_SITES:
        return COMPANY_SITES[n]
    n2 = re.sub(r"\b(pvt|private|ltd|limited|inc|llp|india|technologies|technology|solutions|services|consulting|corp|corporation|co)\b\.?", "", n)
    n2 = re.sub(r"\s+", " ", n2).strip(" .,")
    return COMPANY_SITES.get(n2, "")
