"""Password hashing (scrypt, Python standard library) and JWT tokens."""
import base64, hashlib, hmac, os, time
import jwt
from . import config

def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.scrypt(pw.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(dk).decode()

def verify_password(pw: str, stored: str) -> bool:
    try:
        _, s, h = stored.split("$")
        dk = hashlib.scrypt(pw.encode(), salt=base64.b64decode(s), n=2**14, r=8, p=1, dklen=32)
        return hmac.compare_digest(dk, base64.b64decode(h))
    except Exception:
        return False

def make_token(user: dict) -> str:
    now = int(time.time())
    payload = {"sub": user["id"], "role": user["role"], "iat": now, "exp": now + config.JWT_HOURS * 3600}
    return jwt.encode(payload, config.JWT_SECRET, algorithm="HS256")

def read_token(token: str):
    try:
        return jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None

# simple login rate limit: 8 failed tries per email per 15 minutes
_fails: dict[str, list[float]] = {}

def too_many_fails(key: str) -> bool:
    now = time.time()
    _fails[key] = [t for t in _fails.get(key, []) if now - t < 900]
    return len(_fails[key]) >= 8

def note_fail(key: str):
    _fails.setdefault(key, []).append(time.time())

def clear_fails(key: str):
    _fails.pop(key, None)
