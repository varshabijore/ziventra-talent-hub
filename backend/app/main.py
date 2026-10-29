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
    u = current_user(request)
    c, p = S["cand"], dict(request.query_params)
    return ok(await run_in_threadpool(lambda: c.memo("search", p, lambda: c.search(p, u["id"]))))


async def export(request):
    u = current_user(request)
    rows = await run_in_threadpool(S["cand"].export_rows, dict(request.query_params), u["id"])
    cols = ["pool", "name", "linkedin_url", "current_title", "current_company", "city", "standard_title", "domain_experience_years",
            "total_experience_years", "certifications", "open_to_work", "data_status", "percent", "has_email", "has_phone", "updated_at"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    for r in rows:
        w.writerow([r.get(c, "") for c in cols])
    log(request, u, "export", f"{len(rows)} rows")
    return Response("﻿" + buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="candidates-{today_ist()}.csv"'})


async def candidate(request):
    cid = request.path_params["cid"]
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


# ---------- settings ----------
async def health(request):
    return ok({"ok": True, "mode": config.DATA_MODE})


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
    Route("/api/candidates", candidates),
    Route("/api/candidates/export", export),
    Route("/api/candidates/{cid}", candidate, methods=["GET", "PATCH"]),
]

app = Starlette(routes=routes, lifespan=lifespan,
                middleware=[Middleware(GZipMiddleware, minimum_size=1000), Middleware(CORSMiddleware, allow_origins=config.FRONTEND_ORIGINS, allow_methods=["*"],
                                       allow_headers=["Authorization", "Content-Type"], expose_headers=["Content-Disposition"])],
                exception_handlers={HTTPException: http_error, 500: server_error})
