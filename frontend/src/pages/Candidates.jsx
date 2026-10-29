import { useEffect, useRef, useState } from "react";
import { api, qs } from "../api.js";
import { Avatar, ErrorBox, Icon, Loading, PoolChip, StatusChip, fmt, tone, useSmall, useToast, when } from "../components/ui.jsx";
import { useCached } from "../context/DataContext.jsx";
import { go } from "../router.js";

const DEFAULT = { q: "", pool: "", city: "", role: "", bucket: "", data_status: "", min_score: "", updated_within: "", first_seen: "",
  open_to_work: false, certified: false, has_email: false, has_phone: false, in_role: false, sort: "updated", dir: "desc", page: 1 };
const CHECKS = [["open_to_work", "Open to work"], ["certified", "Certified"], ["has_email", "Email"], ["has_phone", "Phone"], ["in_role", "In role now"]];
const href = (id) => "/candidate/" + encodeURIComponent(id);
const store = { get: (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };

// completeness badge: opens the profile at its "Profile completeness" box
function Badge({ c }) {
  const open = (e) => { e.preventDefault(); e.stopPropagation(); go(href(c.id) + "#complete"); };
  return <span role="link" tabIndex={0} className={"chip mono badge " + tone(c.percent)[1]} onClick={open} onKeyDown={(e) => e.key === "Enter" && open(e)} title="See what is missing">{c.percent}%</span>;
}

function Card({ c }) {
  return (
    <a className="card" href={href(c.id)}>
      <div className="head"><Avatar c={c} />
        <div style={{ minWidth: 0, flex: 1 }}><div className="name">{c.name}</div>
          <div className="role">{c.current_title || c.standard_title || "Title missing"}{c.current_company ? " · " + c.current_company : ""}</div></div>
        <Badge c={c} /></div>
      <div className="meta">
        {c.city && <span><Icon name="pin" />{c.city}</span>}
        {c.domain_experience_years != null && <span><Icon name="bag" />{c.domain_experience_years} yrs {c.pool}</span>}
        {c.certifications && <span><Icon name="cert" />{String(c.certifications).split(";")[0]}</span>}
        {c.has_email && <span title="Email found"><Icon name="mail" /></span>}
        {c.has_phone && <span title="Phone found"><Icon name="phone" /></span>}
      </div>
      <div className="chips"><PoolChip pool={c.pool} /><StatusChip status={c.data_status} />{c.open_to_work === "Yes" && <span className="chip c-good">Open to work</span>}</div>
      <div className="upd">Updated {when(c.updated_at)} · by {c.updated_by}</div>
    </a>
  );
}

export default function Candidates({ query }) {
  const toast = useToast();
  const [F, setF] = useState(() => ({ ...DEFAULT, first_seen: query.get("first_seen") || "" }));
  const [viewPick, setView] = useState(() => store.get("cand_view", "cards"));
  const small = useSmall();
  const view = small ? "cards" : viewPick; // phones always get cards
  const [q, setQ] = useState(F.q);

  const dayParam = query.get("first_seen") || "";
  useEffect(() => { setF((f) => (f.first_seen === dayParam ? f : { ...f, first_seen: dayParam, page: 1 })); }, [dayParam]);
  useEffect(() => { const t = setTimeout(() => setF((f) => (f.q === q ? f : { ...f, q, page: 1 })), 250); return () => clearTimeout(t); }, [q]);


  const { data: r, error, reload } = useCached("/candidates" + qs({ ...F, size: view === "table" ? 25 : small ? 6 : 12 }), { keep: true });
  const set = (k, v) => setF((f) => ({ ...f, [k]: v, page: 1 }));
  const reset = () => { setQ(""); setF({ ...DEFAULT }); if (query.get("first_seen")) go("/candidates"); };
  const exportCsv = async () => {
    try {
      const res = await api("/candidates/export" + qs({ ...F, page: "" }), { raw: true });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await res.blob());
      a.download = `candidates-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      toast("Download started");
    } catch (ex) { toast(ex.message, true); }
  };

  if (error && !r) return <ErrorBox error={error} retry={reload} />;
  if (!r) return <Loading />;
  const s = r.stats, f = r.facets;
  const Sel = ({ k, label, opts }) => (
    <select aria-label={label} value={String(F[k])} onChange={(e) => set(k, e.target.value)}>
      <option value="">{label}</option>{opts.map((o) => { const v = o.v ?? o; return <option key={v} value={v}>{o.l ?? o}</option>; })}
    </select>
  );
  const K = ({ l, v, sub, hl }) => <div className="kpi" style={hl ? { borderColor: "var(--brand)", background: "var(--brand-soft)" } : undefined}><div><div className="l">{l}</div><div className="v">{v}</div><div className="d">{sub}</div></div></div>;
  const from = r.items.length ? (r.page - 1) * r.size + 1 : 0;

  return (
    <>
      <div className="top"><div><h1>Candidates</h1><p>{fmt(s.total)} candidates match your filters</p></div>
        <button className="btn" type="button" onClick={exportCsv}><Icon name="download" /> Download CSV</button></div>
      <section className="kpis mini">
        <K hl l="Candidates" v={fmt(s.total)} sub={s.total === s.pool_total ? (F.pool ? F.pool + " only" : "all pools") : `of ${fmt(s.pool_total)} in ${F.pool || "pool"}`} />
        <K l={`In a ${F.pool || "matching"} role`} v={fmt(s.in_role)} sub="current title matches" />
        <K l="Full profiles" v={fmt(s.enriched)} sub="enriched or refreshed" />
        <K l="Certified" v={fmt(s.certified)} sub="1+ certification" />
        <K l="Open to work" v={fmt(s.open_to_work)} sub="LinkedIn #OpenToWork" />
        <K l="Contactable" v={fmt(s.contactable)} sub="email or phone found" />
        <K l="Cities" v={fmt(s.cities)} sub="where they are based" />
        <K l="Avg profile" v={s.avg_percent + "%"} sub="completeness" />
      </section>
      <section className="panel"><div className="filters">
        <input className="q" type="search" placeholder="Search name, title, company, skill, module…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <Sel k="pool" label="All pools" opts={["ServiceNow", "AI/ML"]} />
        <Sel k="city" label="All cities" opts={f.cities} />
        <Sel k="role" label="All roles" opts={f.roles} />
        <Sel k="bucket" label="All experience" opts={f.buckets.map((b) => ({ v: b, l: b === "Unknown" ? "Unknown" : b + " yrs" }))} />
        <Sel k="data_status" label="Data status" opts={f.data_status} />
        <Sel k="min_score" label="Any profile %" opts={[{ v: "90", l: "90%+ complete" }, { v: "70", l: "70%+ complete" }, { v: "50", l: "50%+ complete" }]} />
        <Sel k="updated_within" label="Any update time" opts={[{ v: "1", l: "Updated today" }, { v: "7", l: "Last 7 days" }, { v: "30", l: "Last 30 days" }]} />
        {CHECKS.map(([k, l]) => <label key={k} className="chk"><input type="checkbox" checked={F[k]} onChange={(e) => set(k, e.target.checked)} /> {l}</label>)}
        <button className="btn ghost sm" type="button" onClick={reset}>Reset</button>
        {F.first_seen && <span className="chip c-brand">Found on {F.first_seen} <button type="button" className="chip c-brand" aria-label="Clear day filter" onClick={() => { set("first_seen", ""); go("/candidates"); }}>✕</button></span>}
      </div></section>
      <div className="listhead"><span className="small muted">Showing {fmt(from)}–{fmt((r.page - 1) * r.size + r.items.length)} of {fmt(s.total)}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select aria-label="Sort" style={{ width: "auto" }} value={F.sort} onChange={(e) => setF({ ...F, sort: e.target.value, dir: e.target.value === "name" ? "asc" : "desc", page: 1 })}>
            <option value="updated">Recently updated</option><option value="first_seen">Newest found</option><option value="score">Profile %</option>
            <option value="exp">Domain experience</option><option value="name">Name</option></select>
          {!small && <div className="seg" role="group" aria-label="View">
            {["cards", "table"].map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => { setView(v); store.set("cand_view", v); setF({ ...F, page: 1 }); }}>{v === "cards" ? "Cards" : "Table"}</button>)}</div>}
        </div></div>
      {!r.items.length ? <div className="panel empty">No candidates match these filters. <button className="btn sm" type="button" onClick={reset}>Reset filters</button></div>
        : view === "cards" ? <div className="cards">{r.items.map((c) => <Card key={c.id} c={c} />)}</div>
        : <div className="panel tbl" style={{ padding: "6px 12px" }}><table><thead><tr><th>Name</th><th>Pool</th><th>Current role</th><th>City</th><th>Exp</th><th>Data status</th><th>Contact</th><th>Profile</th><th>Updated</th></tr></thead><tbody>
          {r.items.map((c) => (
            <tr key={c.id} className="click" onClick={(e) => { if (!e.target.closest("button,.badge")) go(href(c.id)); }}>
              <td><b>{c.name}</b></td><td><PoolChip pool={c.pool} /></td>
              <td>{c.current_title}<div className="small muted">{c.current_company}</div></td><td>{c.city}</td>
              <td className="mono">{c.domain_experience_years ?? "-"}</td><td><StatusChip status={c.data_status} /></td>
              <td className="muted">{c.has_email && <span title="Email found"><Icon name="mail" size={15} /></span>} {c.has_phone && <span title="Phone found"><Icon name="phone" size={15} /></span>}{!c.has_email && !c.has_phone && "-"}</td>
              <td><Badge c={c} /></td><td className="small muted">{when(c.updated_at)}</td></tr>
          ))}</tbody></table></div>}
      {r.pages > 1 && <div className="pager">
        <button className="btn sm" type="button" disabled={r.page <= 1} onClick={() => { setF({ ...F, page: r.page - 1 }); scrollTo(0, 0); }}>Previous</button>
        <span>Page {r.page} of {r.pages}</span>
        <button className="btn sm" type="button" disabled={r.page >= r.pages} onClick={() => { setF({ ...F, page: r.page + 1 }); scrollTo(0, 0); }}>Next</button></div>}
    </>
  );
}
