// Talks to the Python backend. The address comes from VITE_API_URL (.env locally, Vercel env in production).
export const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8800/api").replace(/\/$/, "");

const KEY = "talent_session";
export const session = {
  get() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } },
  set(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ } },
  clear() { try { localStorage.removeItem(KEY); } catch { /* storage blocked */ } },
};

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

let onExpired = () => {};
export const setOnExpired = (fn) => { onExpired = fn; };

export async function api(path, { method = "GET", body, raw = false } = {}) {
  const s = session.get();
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (s?.token) headers.Authorization = "Bearer " + s.token;
  let res;
  try {
    res = await fetch(API_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "Can't reach the server. If it was idle, it may be waking up: wait 30-60 seconds and try again.");
  }
  if (res.status === 401 && s?.token && !path.startsWith("/auth/login")) {
    session.clear();
    onExpired();
    throw new ApiError(401, "Session expired. Please sign in again.");
  }
  if (raw) {
    if (!res.ok) throw new ApiError(res.status, "Download failed");
    return res;
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
  return data;
}

export const qs = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== "" && v !== undefined && v !== null && v !== false) p.set(k, v === true ? "1" : v);
  const s = p.toString();
  return s ? "?" + s : "";
};
