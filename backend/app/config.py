"""All settings come from environment variables (set them in Render, never in code)."""
import os
from pathlib import Path

# read backend/.env if it exists (simple KEY=VALUE lines); real environment variables win
_env = Path(__file__).resolve().parent.parent / ".env"
if _env.exists():
    for line in _env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

def env(name, default=""):
    return os.environ.get(name, default).strip()

DATA_MODE = env("DATA_MODE", "mongo")             # "mongo" in production, "memory" for local demo/tests
SN_MONGODB_URI = env("SN_MONGODB_URI")             # sir's ServiceNow cluster
AI_MONGODB_URI = env("AI_MONGODB_URI")             # sir's AI/ML cluster
SN_DB = env("SN_DB", "servicenow")
AI_DB = env("AI_DB", "ai_ml")
CANDIDATE_COLLECTION = env("CANDIDATE_COLLECTION", "candidates_master")
APP_DB = env("APP_DB", "talent_app")               # users, logs, settings live here (ServiceNow cluster)
JWT_SECRET = env("JWT_SECRET", "change-me-in-render")
JWT_HOURS = int(env("JWT_HOURS", "12"))
ADMIN_EMAIL = env("ADMIN_EMAIL").lower()           # first admin, created on startup if missing
ADMIN_PASSWORD = env("ADMIN_PASSWORD")
ADMIN_NAME = env("ADMIN_NAME", "Admin")
FRONTEND_ORIGINS = [o.strip() for o in env("FRONTEND_ORIGINS", "http://localhost:5500").split(",") if o.strip()]
CACHE_SECONDS = int(env("CACHE_SECONDS", "120"))
