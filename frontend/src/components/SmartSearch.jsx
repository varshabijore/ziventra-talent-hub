// Dashboard smart search: type a name, a page, or a plain-English question
// ("salesforce developers in pune with email") and jump straight to the result.
import { useEffect, useMemo, useRef, useState } from "react";
import { api, qs } from "../api.js";
import { go } from "../router.js";
import { Avatar, Icon, PoolChip, fmt } from "./ui.jsx";

const PAGES = [
  { l: "Dashboard", d: "Overview of the talent pool", to: "/dashboard", icon: "home", k: "dashboard home overview" },
  { l: "Candidates", d: "Browse and filter everyone", to: "/candidates", icon: "users", k: "candidates people list browse talent pool" },
  { l: "Add candidate", d: "Add one person by hand", to: "/candidate/new", icon: "userplus", k: "add new create candidate person" },
  { l: "Daily record", d: "What the automation did each day", to: "/daily", icon: "cal", k: "daily record today report day history" },
  { l: "Automation · Workflows", d: "Scraping, enrichment, refresh runs", to: "/automation", icon: "bolt", k: "automation workflows n8n scraping enrichment refresh runs issues apify" },
  { l: "Automation · Contacts", d: "Apollo phones and Treg emails", to: "/automation?tab=contacts", icon: "phone", k: "contacts apollo treg email phone mobile numbers" },
];
const EXAMPLES = ["salesforce developers in pune with email", "workday consultants in usa", "servicenow architects with 8+ years", "ai engineers open to work in bangalore", "found today"];

export default function SmartSearch() {
  const [text, setText] = useState("");
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const box = useRef(null), input = useRef(null);

  // Ctrl+K or "/" focuses the box from anywhere on the page
  useEffect(() => {
    const key = (e) => {
      const typing = /input|textarea|select/i.test(document.activeElement?.tagName || "");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) { e.preventDefault(); input.current?.focus(); setOpen(true); }
    };
    const out = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("keydown", key); document.addEventListener("mousedown", out);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", out); };
  }, []);

  useEffect(() => {
    const t = text.trim();
    if (!t) { setRes(null); return; }
    let stop = false;
    setBusy(true);
    const h = setTimeout(() => api("/search" + qs({ q: t })).then((r) => { if (!stop) setRes(r); }).catch(() => {}).finally(() => { if (!stop) setBusy(false); }), 250);
    return () => { stop = true; clearTimeout(h); };
  }, [text]);

  const t = text.trim().toLowerCase();
  // pages only for short queries where every word matches a page keyword ("contacts", "daily record", "add")
  const words = t.split(/\s+/).filter(Boolean);
  const pages = words.length && words.length <= 3
    ? PAGES.filter((p) => words.every((w) => p.k.split(" ").some((kw) => kw.startsWith(w) && w.length >= 2))).slice(0, 3) : [];
  const items = useMemo(() => {
    const list = [];
    if (res && t && (res.chips.length || res.count)) list.push({ kind: "all", to: "/candidates" + qs(res.filters) });
    if (res?.relaxed) list.push({ kind: "relaxed", r: res.relaxed, to: "/candidates" + qs(res.relaxed.filters) });
    (res?.people || []).forEach((c) => list.push({ kind: "person", c, to: "/candidate/" + encodeURIComponent(c.id) }));
    pages.forEach((p) => list.push({ kind: "page", p, to: p.to }));
    return list;
  }, [res, t, pages.length]);    // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setSel(0), [items.length, text]);

  const pick = (it) => { if (!it) return; setOpen(false); setText(""); go(it.to); };
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(items[sel]); }
    else if (e.key === "Escape") { setOpen(false); input.current?.blur(); }
  };

  return (
    <div className="ssearch" ref={box}>
      <div className={"ssbox" + (open ? " on" : "")}>
        <Icon name="search" size={18} />
        <input ref={input} value={text} onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          placeholder="Search anything: a name, a company, a page, or “salesforce developers in pune with email”"
          aria-label="Smart search" role="combobox" aria-expanded={open} aria-controls="ss-list" autoComplete="off" />
        {busy ? <span className="spin" aria-hidden="true" /> : <kbd>Ctrl K</kbd>}
      </div>
      {open && (
        <div className="ssdrop" id="ss-list" role="listbox">
          {!t && (
            <div className="sshelp">
              <div className="small muted">Try plain English, for example:</div>
              <div className="ssex">{EXAMPLES.map((x) => <button key={x} type="button" onClick={() => { setText(x); input.current?.focus(); }}>{x}</button>)}</div>
            </div>
          )}
          {t && !items.length && !busy && <div className="ssnone">Nothing found for “{text.trim()}”. Try a name, a skill, a city or a pool.</div>}
          {items.map((it, i) => (
            <button key={it.kind + (it.c?.id || it.p?.to || it.r?.without || "")} type="button" role="option" aria-selected={i === sel}
              className={"ssitem" + (i === sel ? " on" : "")} onMouseEnter={() => setSel(i)} onClick={() => pick(it)}>
              {it.kind === "all" && (<>
                <span className="ssic"><Icon name="users" size={16} /></span>
                <span className="grow"><b>{res.count ? `Show ${fmt(res.count)} candidate${res.count === 1 ? "" : "s"}` : "No exact match for"}</b>
                  <span className="sschips">{res.chips.map((c) => <span key={c} className="chip tiny">{c}</span>)}{res.text && <span className="chip tiny">“{res.text}”</span>}</span></span>
                <span className="muted small">Enter ↵</span></>)}
              {it.kind === "relaxed" && (<>
                <span className="ssic"><Icon name="sliders" size={16} /></span>
                <span className="grow"><b>Show {fmt(it.r.count)} without the {it.r.without} filter</b><span className="small muted">Closest match with one filter less</span></span>
                <span className="muted small">Try</span></>)}
              {it.kind === "person" && (<>
                <Avatar c={it.c} />
                <span className="grow"><b>{it.c.name}</b><span className="small muted">{[it.c.current_title, it.c.current_company, it.c.city].filter(Boolean).join(" · ")}</span></span>
                <PoolChip pool={it.c.pool} /></>)}
              {it.kind === "page" && (<>
                <span className="ssic"><Icon name={it.p.icon} size={16} /></span>
                <span className="grow"><b>{it.p.l}</b><span className="small muted">{it.p.d}</span></span>
                <span className="muted small">Page</span></>)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
