"""Ziventra Talent Hub API (Starlette). Run: uvicorn app.main:app --reload"""
import csv, datetime as dt, io, re
from contextlib import asynccontextmanager
from pydantic import BaseModel, Field, ValidationError, field_validator
from starlette.applications import Starlette
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from . import config, scoring, security
from .candidates import Candidates, today_ist
from . import automation, transfer
from .store import make_store, now

EMAIL_RX = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
ROLES = {"viewer": 1, "recruiter": 2, "admin": 3}
S = {}  # store + candidates service, created at startup


# ---------- helpers ----------
def err(status, message, **extra):
    return JSONResponse({"error": message, **extra}, status_code=status)


def utc_iso(v):
    return (v if v.tzinfo else v.replace(tzinfo=dt.timezone.utc)).isoformat()


def public_user(u):
    return {k: (utc_iso(v) if isinstance(v, dt.datetime) else v) for k, v in u.items() if k != "password_hash"}


def log(request, user, action, detail=""):
    S["store"].log({"at": now(), "user_id": user["id"] if user else None, "user_name": user["name"] if user else "-",
                    "action": action, "detail": detail[:300], "ip": request.client.host if request.client else ""})


async def body(request, model):
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(400, "Send JSON")
    try:
        return model(**(data or {}))
    except ValidationError as e:
        first = e.errors()[0]
        raise HTTPException(400, f"{'.'.join(str(x) for x in first['loc'])}: {first['msg']}")


def current_user(request, need="viewer"):
    auth = request.headers.get("authorization", "")
    claims = security.read_token(auth[7:]) if auth.lower().startswith("bearer ") else None
    if not claims:
        raise HTTPException(401, "Please sign in again")
    u = S["store"].user_by_id(claims["sub"])
    if not u or u.get("status") != "active":
        raise HTTPException(401, "Your account is not active")
    if ROLES.get(u["role"], 0) < ROLES[need]:
        raise HTTPException(403, "You don't have permission for this")
    return u


def jsonable(o):
    if isinstance(o, dict):
        return {k: jsonable(v) for k, v in o.items()}
    if isinstance(o, list):
        return [jsonable(v) for v in o]
    if isinstance(o, dt.datetime):
        return utc_iso(o)
    return o


def ok(data, status=200):
    return JSONResponse(jsonable(data), status_code=status)


# ---------- models ----------
class Signup(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(pattern=EMAIL_RX, max_length=120)
    password: str = Field(min_length=8, max_length=128)

class Login(BaseModel):
    email: str = Field(pattern=EMAIL_RX, max_length=120)
    password: str = Field(min_length=1, max_length=128)

class MeUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=80)

class PasswordChange(BaseModel):
    current: str
    new: str = Field(min_length=8, max_length=128)

class UserCreate(Signup):
    role: str = "recruiter"

class UserUpdate(BaseModel):
    role: str | None = None
    status: str | None = None
    name: str | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)

class Edit(BaseModel):
    changes: dict
    base: str = ""

class Hiring(BaseModel):
    status: str

class NewCandidate(BaseModel):
    pool: str
    name: str
    linkedin_url: str
    current_title: str = ""
    current_company: str = ""
    city: str = ""
    email: str = ""
    phone: str = ""

class CustomField(BaseModel):
    key: str = Field(pattern=r"^[a-z][a-z0-9_]{1,30}$")
    label: str = Field(min_length=2, max_length=60)
    type: str = "text"
    options: list[str] | None = None
    must: bool = False
    points: int = Field(default=0, ge=0, le=30)
    why: str = ""

    @field_validator("type")
    @classmethod
    def t(cls, v):
        if v not in ("text", "number", "date", "email", "url", "textarea"):
            raise ValueError("type must be text, number, date, email, url or textarea")
        return v

class SettingsIn(BaseModel):
    weights: dict = {}
    custom_fields: list[CustomField] = []


# ---------- auth ----------
async def login(request):
    b = await body(request, Login)
    email = b.email.lower()
    if security.too_many_fails(email):
        return err(429, "Too many wrong tries. Wait 15 minutes and try again.")
    u = await run_in_threadpool(S["store"].user_by_email, email)
    if not u or not security.verify_password(b.password, u["password_hash"]):
        security.note_fail(email)
        return err(401, "Email or password is wrong")
    if u.get("role") != "admin":
        return err(403, "Only the admin account can sign in")
    if u["status"] != "active":
        return err(403, "Your account is disabled. Contact an admin.")
    security.clear_fails(email)
    await run_in_threadpool(S["store"].user_update, u["id"], {"last_login": now()})
    log(request, u, "login")
    return ok({"token": security.make_token(u), "user": public_user(u)})


async def me(request):
    u = current_user(request)
    if request.method == "PATCH":
        b = await body(request, MeUpdate)
        S["store"].user_update(u["id"], {"name": b.name.strip()})
        log(request, u, "profile", "Changed name")
        u = S["store"].user_by_id(u["id"])
    return ok({"user": public_user(u)})


async def change_password(request):
    u = current_user(request)
    b = await body(request, PasswordChange)
    if not security.verify_password(b.current, u["password_hash"]):
        return err(400, "Current password is wrong")
    S["store"].user_update(u["id"], {"password_hash": security.hash_password(b.new)})
    log(request, u, "password", "Changed password")
    return ok({"ok": True})


async def logout(request):
    u = current_user(request)
    log(request, u, "logout")
    return ok({"ok": True})


# ---------- users (admin) ----------
# ---------- candidates ----------
async def dashboard(request):
    u = current_user(request)
    c = S["cand"]
    return ok(await run_in_threadpool(lambda: c.memo("dash", {"d": today_ist()}, lambda: c.dashboard(u["id"]))))


async def daily(request):
    u = current_user(request)
    day = request.query_params.get("date") or today_ist()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
        return err(400, "Date must look like 2026-10-29")
    c = S["cand"]
    return ok(await run_in_threadpool(lambda: c.memo("daily", {"day": day, "t": today_ist()}, lambda: c.daily(day, u["id"]))))


async def candidates(request):
    if request.method == "POST":                     # add one candidate by hand
        u = current_user(request, "recruiter")
        try:
            data = await request.json() or {}
        except Exception:
            raise HTTPException(400, "Send JSON")
        r = await run_in_threadpool(S["cand"].create, str(data.get("pool") or ""), dict(data.get("fields") or {}), u)
        if r.get("error"):
            return err(409 if r["error"] == "duplicate" else 400, r.get("message") or "Could not add", **({"id": r["id"]} if r.get("id") else {}))
        log(request, u, "candidate_add", r["id"])
        return ok(r, 201)
    u = current_user(request)
    c, p = S["cand"], dict(request.query_params)
    return ok(await run_in_threadpool(lambda: c.memo("search", p, lambda: c.search(p, u["id"]))))


async def options(request):
    """GET: pools and roles added on the website. POST {action: add|remove, kind: pool|role, name, desc?}."""
    c = S["cand"]
    if request.method == "GET":
        current_user(request)
        return ok(await run_in_threadpool(c.options))
    u = current_user(request, "recruiter")
    try:
        data = await request.json() or {}
    except Exception:
        raise HTTPException(400, "Send JSON")
    kind, name = str(data.get("kind") or ""), str(data.get("name") or "")
    if data.get("action") == "remove":
        r = await run_in_threadpool(c.remove_option, kind, name)
    else:
        r = await run_in_threadpool(c.add_option, kind, name, str(data.get("desc") or ""))
    if r.get("error"):
        return err(400, r["error"])
    log(request, u, f"option_{data.get('action') or 'add'}", f"{kind}: {name}")
    return ok(r)


async def smart_search(request):
    u = current_user(request)
    text = str(request.query_params.get("q") or "")[:200]
    if not text.strip():
        return ok({"query": "", "filters": {}, "chips": [], "count": 0, "people": []})
    c = S["cand"]
    return ok(await run_in_threadpool(lambda: c.memo("smart", {"q": text}, lambda: c.smart(text, u["id"]))))


async def export(request):
    """GET: all candidates matching the filters (CSV). POST {ids?, filters?, format: csv|xlsx, contact: bool}: chosen ones."""
    u = current_user(request)
    c = S["cand"]
    if request.method == "POST":
        try:
            data = await request.json() or {}
        except Exception:
            raise HTTPException(400, "Send JSON")
        fmt = "xlsx" if data.get("format") == "xlsx" else "csv"
        ids = [str(x) for x in (data.get("ids") or [])][:20000]
        filters = {k: str(v) for k, v in (data.get("filters") or {}).items() if v not in (None, "", False)}
        filters.update({k: "1" for k, v in (data.get("filters") or {}).items() if v is True})
        rows = await run_in_threadpool(c.export_by_ids, ids, u["id"]) if ids else await run_in_threadpool(c.export_by_filter, filters, u["id"])
        contact = data.get("contact", True) is not False
    else:
        fmt, contact = ("xlsx" if request.query_params.get("format") == "xlsx" else "csv"), True
        rows = await run_in_threadpool(c.export_by_filter, dict(request.query_params), u["id"])
    payload, mime = transfer.export_file(rows, fmt, contact)
    log(request, u, "export", f"{len(rows)} rows ({fmt})")
    return Response(payload, media_type=mime,
                    headers={"Content-Disposition": f'attachment; filename="candidates-{today_ist()}.{fmt}"', "X-Rows": str(len(rows)),
                             "Access-Control-Expose-Headers": "Content-Disposition, X-Rows"})


async def import_candidates(request):
    """POST {filename, data (base64), pool, mode: fill|overwrite|skip, mapping?, commit: bool}.
    Without commit: checks the file and returns the column mapping, counts and problems. With commit: saves."""
    u = current_user(request)
    try:
        data = await request.json() or {}
    except Exception:
        raise HTTPException(400, "Send JSON")
    try:
        headers, rows = await run_in_threadpool(transfer.read_file, data.get("filename"), str(data.get("data") or ""))
    except ValueError as e:
        return err(400, str(e))
    except Exception:
        return err(400, "Could not read this file. Save it as .csv or .xlsx and try again.")
    guessed = transfer.guess_mapping(headers)
    mapping = {h: (data.get("mapping") or {}).get(h, guessed[h]) for h in headers}
    mapping = {h: (f if f in transfer.FIELD_LABELS else "") for h, f in mapping.items()}
    pool = data.get("pool") if data.get("pool") in ("ServiceNow", "AI/ML", "Salesforce", "Workday") else ""
    mode = data.get("mode") if data.get("mode") in ("fill", "overwrite", "skip") else "fill"
    commit = bool(data.get("commit"))
    if commit:
        missing = [f for f in ("name", "linkedin_url") if f not in mapping.values()]
        if missing:
            return err(400, "Map these columns first: " + ", ".join(transfer.FIELD_LABELS[f] for f in missing))
    res = await run_in_threadpool(S["cand"].import_rows, rows, mapping, pool, mode, u, commit)
    res.update({"headers": headers, "mapping": mapping, "fields": transfer.FIELD_LABELS,
                "samples": {h: next((r.get(h) for r in rows if r.get(h)), "") for h in headers}})
    if commit:
        log(request, u, "import", f"{data.get('filename')}: {res.get('added', 0)} added, {res.get('updated', 0)} updated, {len(res['errors'])} errors")
    return ok(res)


async def import_template(request):
    current_user(request)
    return Response(transfer.template_csv(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="candidates-import-template.csv"'})


async def delete_candidates(request):
    """POST {ids: [...]} - delete several (from the list selection)."""
    u = current_user(request, "recruiter")
    try:
        data = await request.json() or {}
    except Exception:
        raise HTTPException(400, "Send JSON")
    ids = [str(x) for x in (data.get("ids") or [])][:5000]
    r = await run_in_threadpool(S["cand"].delete, ids, u)
    log(request, u, "candidate_delete", f"{r['deleted']} deleted")
    return ok(r)


async def candidate(request):
    cid = request.path_params["cid"]
    if request.method == "DELETE":
        u = current_user(request, "recruiter")
        r = await run_in_threadpool(S["cand"].delete, [cid], u)
        if not r["deleted"]:
            return err(404, "Candidate not found")
        log(request, u, "candidate_delete", cid)
        return ok(r)
    if request.method == "PATCH":
        u = current_user(request, "recruiter")
        b = await body(request, Edit)
        r = await run_in_threadpool(S["cand"].update_fields, cid, b.changes, u, b.base)
        if r.get("error") == "not_found":
            return err(404, "Candidate not found")
        if r.get("error") == "conflict":
            return err(409, f"{r['by']} changed this profile after you opened it. Reload to see their changes.", **r)
        if r.get("error"):
            return err(400, r.get("message") or f"Field can't be edited: {r.get('field')}")
        if r.get("changed"):
            log(request, u, "candidate_edit", f"{cid}: " + ", ".join(b.changes.keys()))
    u = current_user(request)
    v = await run_in_threadpool(S["cand"].get, cid, u["id"])
    if not v:
        return err(404, "Candidate not found")
    return ok(v)


async def automation_page(request):
    current_user(request)
    today = dt.datetime.now(automation.IST).date()
    def day(key, default):
        v = request.query_params.get(key) or ""
        return v if re.fullmatch(r"\d{4}-\d{2}-\d{2}", v) else default.isoformat()
    start, end = day("from", today), day("to", today)
    if (dt.date.fromisoformat(end) - dt.date.fromisoformat(start)).days > 90:
        return err(400, "Choose at most 90 days")
    def build():
        st = S["store"]
        lo = min(start, end, (today - dt.timedelta(days=7)).isoformat())
        return automation.report(st.runs_since(lo), st.errors_since(lo), start, end)
    return ok(await run_in_threadpool(build))


async def contacts_page(request):
    """Automation page, Contacts tab: Apollo phone + Treg email results for the chosen days."""
    current_user(request)
    today = dt.datetime.now(automation.IST).date()
    def day(key, default):
        v = request.query_params.get(key) or ""
        return v if re.fullmatch(r"\d{4}-\d{2}-\d{2}", v) else default.isoformat()
    start, end = day("from", today), day("to", today)
    if (dt.date.fromisoformat(end) - dt.date.fromisoformat(start)).days > 90:
        return err(400, "Choose at most 90 days")
    def build():
        st = S["store"]
        lo = min(start, end, (today - dt.timedelta(days=7)).isoformat())
        people = [v for v in S["cand"].all_views() if v.get("apollo_checked_at") or v.get("treg_checked_at")]
        return automation.contacts(st.runs_since(lo), people, start, end)
    return ok(await run_in_threadpool(build))


# ---------- settings ----------
async def health(request):
    cand = S.get("cand")
    return ok({"ok": True, "mode": config.DATA_MODE, **(cand.status if cand else {})})


# ---------- app ----------
@asynccontextmanager
async def lifespan(app):
    st = make_store()
    S["store"], S["cand"] = st, Candidates(st)
    S["cand"].warm()  # load candidates in the background right away
    if config.ADMIN_EMAIL and config.ADMIN_PASSWORD and not st.user_by_email(config.ADMIN_EMAIL):
        st.user_insert({"name": config.ADMIN_NAME, "email": config.ADMIN_EMAIL, "password_hash": security.hash_password(config.ADMIN_PASSWORD),
                        "role": "admin", "status": "active", "created_at": now(), "last_login": None})
    elif config.ADMIN_EMAIL and config.ADMIN_PASSWORD and config.env("ADMIN_RESET").lower() == "yes":
        u = st.user_by_email(config.ADMIN_EMAIL)
        st.user_update(u["id"], {"password_hash": security.hash_password(config.ADMIN_PASSWORD), "status": "active", "role": "admin"})
    if config.ADMIN_EMAIL and st.user_by_email(config.ADMIN_EMAIL):
        st.users_keep_only(config.ADMIN_EMAIL)  # admin-only site: remove old test accounts
    yield


async def http_error(request, exc):
    return err(exc.status_code, exc.detail)


async def server_error(request, exc):
    return err(500, "Something went wrong on the server. Try again.")


routes = [
    Route("/api/health", health),
    Route("/api/auth/login", login, methods=["POST"]),
    Route("/api/auth/logout", logout, methods=["POST"]),
    Route("/api/auth/me", me, methods=["GET", "PATCH"]),
    Route("/api/auth/password", change_password, methods=["POST"]),
    Route("/api/dashboard", dashboard),
    Route("/api/daily", daily),
    Route("/api/automation", automation_page),
    Route("/api/contacts", contacts_page),
    Route("/api/search", smart_search),
    Route("/api/options", options, methods=["GET", "POST"]),
    Route("/api/candidates", candidates, methods=["GET", "POST"]),
    Route("/api/candidates/delete", delete_candidates, methods=["POST"]),
    Route("/api/candidates/export", export, methods=["GET", "POST"]),
    Route("/api/candidates/import", import_candidates, methods=["POST"]),
    Route("/api/candidates/import/template", import_template),
    Route("/api/candidates/{cid}", candidate, methods=["GET", "PATCH", "DELETE"]),
]

app = Starlette(routes=routes, lifespan=lifespan,
                middleware=[Middleware(GZipMiddleware, minimum_size=1000), Middleware(CORSMiddleware, allow_origins=config.FRONTEND_ORIGINS, allow_methods=["*"],
                                       allow_headers=["Authorization", "Content-Type"], expose_headers=["Content-Disposition"])],
                exception_handlers={HTTPException: http_error, 500: server_error})
