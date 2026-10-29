// Shared building blocks: icons, chips, avatar, KPI card, completeness badge with popover, toast, modal, charts.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";

export const fmt = (n) => Number(n || 0).toLocaleString("en-IN");
export const initials = (n) => String(n || "?").trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();

export function when(v) {
  if (!v) return "-";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const d = new Date(s);
  if (isNaN(d)) return s;
  const mins = (Date.now() - d) / 60000;
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.floor(mins)} min ago`;
  if (mins < 60 * 24 && d.getDate() === new Date().getDate()) return "today, " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

const paths = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  cal: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></>,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  shield: <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  refresh: <path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4" />,
  pen: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  out: <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />,
  pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  bag: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  cert: <><circle cx="12" cy="9" r="5" /><path d="M9 13.5 7.5 21 12 18.5 16.5 21 15 13.5" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  phone: <path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  download: <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />,
  link: <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />,
  panel: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></>,
  chev: <path d="m15 6-6 6 6 6" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12 5 5 9-10" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  down: <path d="m6 9 6 6 6-6" />,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3" /></>,
};
export const Icon = ({ name, size }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
);

export const PoolChip = ({ pool }) => <span className={"chip " + (pool === "ServiceNow" ? "c-sn" : "c-ai")}>{pool}</span>;
const D_TONE = { Discovered: "c-mute", Enriched: "c-sn", Refreshed: "c-info", Rejected: "c-bad" };
export const StatusChip = ({ status }) => <span className={"chip " + (D_TONE[status] || "c-mute")} title="Data status (set by automation)">{status}</span>;
export const tone = (p) => (p >= 90 ? ["var(--good)", "c-good"] : p >= 70 ? ["var(--info)", "c-info"] : p >= 50 ? ["var(--warn)", "c-warn"] : ["var(--bad)", "c-bad"]);
export const Avatar = ({ c, className = "" }) => <div className={`av ${c.pool === "ServiceNow" ? "c-sn" : "c-ai"} ${className}`}>{initials(c.name)}</div>;

export function Kpi({ icon, bg, fg, label, value, sub, up, highlight }) {
  return (
    <div className="kpi" style={highlight ? { borderColor: "var(--brand)", background: "var(--brand-soft)" } : undefined}>
      {icon && <div className="ic" style={{ background: bg, color: fg }}><Icon name={icon} /></div>}
      <div><div className="l">{label}</div><div className="v">{value}</div><div className={"d" + (up ? " up" : "")}>{sub}</div></div>
    </div>
  );
}

// ---------- toast ----------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const show = useCallback((text, err = false) => {
    setT({ text, err, id: Math.random() });
    setTimeout(() => setT((cur) => (cur && cur.text === text ? null : cur)), err ? 4500 : 2600);
  }, []);
  return <ToastCtx.Provider value={show}>{children}{t && <div className={"toast" + (t.err ? " err" : "")} role="status">{t.text}</div>}</ToastCtx.Provider>;
}

// ---------- popover anchored to a button ----------
export function Popover({ anchor, onClose, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    let x = Math.min(innerWidth - w - 16, Math.max(16, r.right - w)), y = r.bottom + 8;
    if (y + h > innerHeight - 16) y = Math.max(16, r.top - h - 8);
    if (y + h > innerHeight - 16) y = Math.max(16, innerHeight - h - 16);
    setPos({ left: x, top: y });
  }, [anchor, children]);
  useEffect(() => {
    const out = (e) => { if (ref.current && !ref.current.contains(e.target) && !anchor.contains(e.target)) onClose(); };
    const esc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", esc);
    addEventListener("resize", onClose);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc); removeEventListener("resize", onClose); };
  }, [anchor, onClose]);
  return <div ref={ref} className="pop" role="dialog" style={pos}>{children}</div>;
}

export function MissingList({ c, onFill }) {
  if (c.percent >= 100) return <><h3>Profile 100% complete</h3><p style={{ color: "var(--good)", fontWeight: 600, margin: "6px 0 0" }}>All fields are filled.</p></>;
  return (
    <>
      <h3>Profile {c.percent}% complete</h3>
      <div className="small muted">What is missing, biggest first</div>
      <ul>{(c.missing || []).map((m) => (
        <li key={m.key + m.label}><span style={{ color: "var(--bad)" }}>✗</span><span>{m.label}</span><span className="pts">−{m.lost}</span><span className="why">{m.why}</span></li>
      ))}</ul>
      {onFill && <button className="btn primary" style={{ width: "100%" }} type="button" onClick={onFill}>Fill missing fields</button>}
    </>
  );
}

export function Ring({ percent, big }) {
  const [col] = tone(percent);
  return <span className={"ring" + (big ? " big" : "")} style={{ "--p": percent, "--c": col }}><span>{percent}%</span></span>;
}

// ---------- modal ----------
export function Modal({ onClose, children }) {
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  return <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="modal" role="dialog" aria-modal="true">{children}</div></div>;
}

// ---------- charts ----------
export function BarChart({ rows, series, height = 170, width = 900, every = 1 }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollLeft = ref.current.scrollWidth; }, [rows]);
  const W = width, H = height, L = 36, B = 26, n = rows.length || 1, bw = (W - L) / n;
  const max = Math.max(4, ...rows.map((r) => series.reduce((a, s) => a + (r[s.key] || 0), 0)));
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000].find((s) => max / s <= 5) || 20000;
  const top = Math.ceil(max / step) * step;
  const y = (v) => H - B - (v / top) * (H - B - 12);
  const ticks = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return (
    <>
      <div ref={ref} style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 440 }} role="img" aria-label="Bar chart">
          {ticks.map((t) => <g key={t}><line x1={L} x2={W} y1={y(t)} y2={y(t)} stroke="var(--line)" /><text x={L - 6} y={y(t) + 4} textAnchor="end">{fmt(t)}</text></g>)}
          {rows.map((r, i) => {
            const x = L + i * bw + bw * 0.18, w = Math.max(2, bw * 0.64);
            let acc = 0;
            return (
              <g key={i}>
                {series.map((s) => {
                  const v = r[s.key] || 0;
                  const el = v ? <rect key={s.key} x={x} y={y(acc + v)} width={w} height={y(acc) - y(acc + v)} rx="2" fill={s.color}><title>{`${r.label}: ${s.name} ${fmt(v)}`}</title></rect> : null;
                  acc += v;
                  return el;
                })}
                {(i % every === every - 1 || i === n - 1) && <text x={i === n - 1 ? x + w : x + w / 2} y={H - 8} textAnchor={i === n - 1 ? "end" : "middle"}>{r.label}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="legend">{series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.name}</span>)}</div>
    </>
  );
}

export function HBars({ items, color = "var(--brand)" }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="bars">{items.map((i) => (
      <div className="bar" key={i.label}><span title={i.label} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.label}</span>
        <span className="tr"><i style={{ width: Math.max(2, (i.value / max) * 100) + "%", background: i.color || color }} /></span>
        <span className="n mono">{fmt(i.value)}</span></div>
    ))}</div>
  );
}

export function Donut({ parts, label }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1, r = 52, C = 2 * Math.PI * r;
  let off = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <svg viewBox="0 0 140 140" width="130" height="130" role="img" aria-label={label}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--soft)" strokeWidth="18" />
        {parts.map((p) => {
          const len = (p.value / total) * C;
          const el = <circle key={p.label} cx="70" cy="70" r={r} fill="none" stroke={p.color} strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform="rotate(-90 70 70)"><title>{`${p.label}: ${fmt(p.value)}`}</title></circle>;
          off += len;
          return el;
        })}
        <text x="70" y="68" textAnchor="middle" style={{ fill: "var(--ink)", fontWeight: 700, fontSize: 18 }}>{fmt(total)}</text>
        <text x="70" y="86" textAnchor="middle">{label}</text>
      </svg>
      <div className="legend" style={{ flexDirection: "column", gap: 8, fontSize: 13 }}>
        {parts.map((p) => <span key={p.label}><i style={{ background: p.color }} />{p.label} <b className="mono" style={{ color: "var(--ink)" }}>{fmt(p.value)}</b></span>)}
      </div>
    </div>
  );
}

export const Loading = () => <div className="loading">Loading…</div>;
export const ErrorBox = ({ error, retry }) => (
  <div className="panel empty"><b>Couldn't load this page.</b><br />{error}<br /><br />{retry && <button className="btn" onClick={retry}>Try again</button>}</div>
);

// true on phones / small tablets (layout switches to the compact view)
export function useSmall(q = "(max-width: 760px)") {
  const [m, setM] = useState(() => typeof matchMedia !== "undefined" && matchMedia(q).matches);
  useEffect(() => { const mq = matchMedia(q); const on = () => setM(mq.matches); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }, [q]);
  return m;
}

// fetch helper hook: {data, error, loading, reload}
export function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e) => alive && setState({ data: null, error: e.message, loading: false }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1), setData: (d) => setState((s) => ({ ...s, data: d })) };
}
