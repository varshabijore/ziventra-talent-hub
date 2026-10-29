// Shared data cache (React Context). Pages show the last data instantly and refresh it quietly in the background,
// so moving between Dashboard / Candidates / Daily record does not wait for the server again.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";

const Ctx = createContext(null);
const FRESH_MS = 60_000; // younger than this: no refetch at all
const STORE = "th_cache_v1"; // last data is kept in the browser, so a page reload shows it instantly

function loadSaved() {
  try { return new Map(Object.entries(JSON.parse(localStorage.getItem(STORE) || "{}"))); } catch { return new Map(); }
}
let saveTimer;
function save(map) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const recent = [...map.entries()].sort((a, b) => b[1].ts - a[1].ts).slice(0, 25); // newest 25 pages only
      let json = JSON.stringify(Object.fromEntries(recent));
      if (json.length > 3_000_000) json = JSON.stringify(Object.fromEntries(recent.slice(0, 5)));
      localStorage.setItem(STORE, json);
    } catch { /* storage full or blocked: cache stays in memory only */ }
  }, 300);
}

export function DataProvider({ children }) {
  const cache = useRef(loadSaved()); // key -> { data, ts }
  const inflight = useRef(new Map()); // key -> promise (same request is never sent twice at once)

  const fetchKey = useCallback((key) => {
    if (inflight.current.has(key)) return inflight.current.get(key);
    const p = api(key).then((data) => { cache.current.set(key, { data, ts: Date.now() }); save(cache.current); return data; })
      .finally(() => inflight.current.delete(key));
    inflight.current.set(key, p);
    return p;
  }, []);

  const value = useMemo(() => ({
    cache, fetchKey,
    prefetch: (keys) => keys.forEach((k) => { if (!cache.current.has(k)) fetchKey(k).catch(() => {}); }),
    put: (key, data) => { cache.current.set(key, { data, ts: Date.now() }); save(cache.current); },
    // after an edit: forget lists and totals so they reload with the new values
    invalidate: (...prefixes) => { for (const k of [...cache.current.keys()]) if (prefixes.some((p) => k.startsWith(p))) cache.current.delete(k); save(cache.current); },
    clear: () => { cache.current.clear(); try { localStorage.removeItem(STORE); } catch { /* ignore */ } },
  }), [fetchKey]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useData = () => useContext(Ctx);

/** Load an API path through the cache. keep=true keeps showing the previous result while a new key loads. */
export function useCached(key, { keep = false } = {}) {
  const { cache, fetchKey, put } = useContext(Ctx);
  const hit = cache.current.get(key);
  const [state, setState] = useState(() => ({ data: hit?.data ?? null, error: null, loading: !hit }));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const h = cache.current.get(key);
    if (h) setState({ data: h.data, error: null, loading: false });
    else setState((s) => ({ data: keep ? s.data : null, error: null, loading: true }));
    if (h && !tick && Date.now() - h.ts < FRESH_MS) return () => { alive = false; };
    fetchKey(key)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e) => alive && setState((s) => (h ? { ...s, loading: false } : { data: null, error: e.message, loading: false })));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  return {
    ...state,
    reload: () => setTick((t) => t + 1),
    setData: (d) => { put(key, d); setState((s) => ({ ...s, data: d })); },
  };
}
