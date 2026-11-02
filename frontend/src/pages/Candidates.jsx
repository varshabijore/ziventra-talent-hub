import { useEffect, useState } from "react";
import { api, qs } from "../api.js";
import { ExportModal, ImportModal } from "../components/Transfer.jsx";
import { Avatar, ErrorBox, Icon, Loading, Modal, PoolChip, StatusChip, fmt, tone, useSmall, useToast, when } from "../components/ui.jsx";
import { useCached, useData } from "../context/DataContext.jsx";
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

// company icon from its website (favicon); initials when we don't know the website or the icon fails
// company icon (from its website) - initials in the company's colour when there is no icon - an empty light box when no company
function CompanyLogo({ c, size = "" }) {
  const [bad, setBad] = useState(false);
  const name = String(c.current_company || "").trim();
  if (!name) return <span className={"clogo empty " + size} title="Company not added" />;
  const ini = name.replace(/[^A-Za-z0-9 ]/g, "").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  let h = 0; for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360;   // same company = same colour
  return (
    <span className={"clogo " + size} title={name} style={{ "--h": h }}>
      {c.company_domain && !bad ? <img src={`https://www.google.com/s2/favicons?domain=${c.company_domain}&sz=64`} alt="" loading="lazy" onError={() => setBad(true)} /> : <i>{ini}</i>}
    </span>
  );
}

// company box that turns into a checkbox on hover / while selecting
function PickLogo({ c, picked, onPick, size }) {
  return (
    <label className="avsel" onClick={(e) => e.stopPropagation()} title={c.current_company ? `${c.current_company} · click to select` : "Click to select"}>
      <CompanyLogo c={c} size={size} />
      <input type="checkbox" checked={picked} onChange={(e) => onPick(c.id, e.target.checked)} onClick={(e) => e.stopPropagation()} aria-label={"Select " + c.name} />
    </label>
  );
}

function Card({ c, picked, onPick }) {
  const Line = ({ icon, v, empty, strong }) => <div className={"cline" + (v ? "" : " none") + (strong && v ? " strong" : "")}><Icon name={icon} size={14} /><span>{v || empty}</span></div>;
  return (
    <a className={"card ccard" + (picked ? " picked" : "")} href={href(c.id)}>
      <div className="head"><PickLogo c={c} picked={picked} onPick={onPick} size="lg" />
        <div style={{ minWidth: 0, flex: 1 }}><div className="name">{c.name}</div>
          <div className="role">{c.current_title || c.standard_title || "Title missing"}</div></div>
        <Badge c={c} /></div>
      {c.total_experience_years != null || c.domain_experience_years != null ? (
        <div className="cexp">
          <div><b>{c.domain_experience_years ?? "–"}<small> yrs</small></b><span>{c.pool} exp</span></div>
          <div><b>{c.total_experience_years ?? "–"}<small> yrs</small></b><span>Total exp</span></div>
        </div>
      ) : <div className="cexp none"><span>Experience not added yet</span></div>}
      <div className="clines">
        <Line icon="building" v={c.current_company} empty="Company not added" strong />
        <Line icon="pin" v={[c.city, c.state].filter(Boolean).join(", ")} empty="Location not added" strong />
        <Line icon="cert" v={c.certifications && String(c.certifications).split(";")[0].trim()} empty="No certification" strong />
      </div>
      <div className="chips"><PoolChip pool={c.pool} /><StatusChip status={c.data_status} />{c.open_to_work === "Yes" && <span className="chip c-good">Open to work</span>}</div>
      <div className="upd">Updated {when(c.updated_at)} · by {c.updated_by}</div>
    </a>
  );
}

export default function Candidates({ query }) {
  const data = useData();
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
  const reset = () => { setQ(""); setF({ ...DEFAULT }); setPicked(new Set()); if (query.get("first_seen")) go("/candidates"); };
  const [picked, setPicked] = useState(() => new Set());
  const [modal, setModal] = useState("");
  const [busyDel, setBusyDel] = useState(false);
  const toast = useToast();
  const delSelected = async () => {
    setBusyDel(true);
    try {
      const res = await api("/candidates/delete", { method: "POST", body: { ids: [...picked] } });
      toast(`Deleted ${res.deleted} candidate${res.deleted === 1 ? "" : "s"}`);
      setPicked(new Set()); setModal("");
      data.invalidate("/candidates?", "/dashboard", "/daily"); reload();
    } catch (ex) { toast(ex.message, true); } finally { setBusyDel(false); }
  };
  const pick = (id, on) => setPicked((p) => { const n = new Set(p); on ? n.add(id) : n.delete(id); return n; });
  const pageIds = r ? r.items.map((c) => c.id) : [];
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => picked.has(id));
  const pickPage = (on) => setPicked((p) => { const n = new Set(p); pageIds.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });

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
        <div className="tbtns">
          <a className="btn primary icon addbtn" href="/candidate/new" title="Add a candidate by hand"><span className="addic"><Icon name="userplus" size={15} /></span><span>Add candidate</span></a>
          <button className="btn icon" type="button" onClick={() => setModal("import")} title="Import from CSV / Excel" aria-label="Import from CSV or Excel"><Icon name="import" /><span>Import</span></button>
          <button className="btn icon" type="button" onClick={() => setModal("export")} title="Export to CSV / Excel" aria-label="Export to CSV or Excel"><Icon name="export" /><span>Export</span></button>
        </div></div>
      {modal === "export" && <ExportModal selected={[...picked]} total={s.total} filters={F} onClose={() => setModal("")} />}
      {modal === "delete" && (
        <Modal onClose={() => !busyDel && setModal("")}>
          <h2>Delete {fmt(picked.size)} candidate{picked.size === 1 ? "" : "s"}?</h2>
          <p className="muted" style={{ margin: 0 }}>They will be removed from the website: lists, dashboard, exports and counts. The automation will not add them back. If it was a mistake, adding the same LinkedIn profile again brings back their old details.</p>
          <div className="actions"><button className="btn" type="button" onClick={() => setModal("")} disabled={busyDel}>Cancel</button>
            <button className="btn danger solid" type="button" onClick={delSelected} disabled={busyDel}><Icon name="trash" /> {busyDel ? "Deleting…" : "Delete"}</button></div>
        </Modal>)}
      {modal === "import" && <ImportModal onClose={() => setModal("")} onDone={() => { data.invalidate("/candidates?", "/dashboard", "/daily"); reload(); }} />}
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
      {picked.size > 0 && (
        <div className="selbar">
          <b>{fmt(picked.size)} selected</b>
          {!allOnPage && <button type="button" className="linkbtn" onClick={() => pickPage(true)}>Select all {r.items.length} on this page</button>}
          <button type="button" className="linkbtn" onClick={() => setPicked(new Set())}>Clear</button>
          <div className="selact">
            <button type="button" className="btn sm danger" onClick={() => setModal("delete")}><Icon name="trash" /> Delete</button>
            <button type="button" className="btn primary sm" onClick={() => setModal("export")}><Icon name="export" /> Export selected</button>
          </div>
        </div>)}
      {!r.items.length ? <div className="panel empty">No candidates match these filters. <button className="btn sm" type="button" onClick={reset}>Reset filters</button></div>
        : view === "cards" ? <div className={"cards" + (picked.size ? " selecting" : "")}>{r.items.map((c) => <Card key={c.id} c={c} picked={picked.has(c.id)} onPick={pick} />)}</div>
        : <div className={"panel tbl ptbl" + (picked.size ? " selecting" : "")} style={{ padding: "6px 12px" }}><table><thead><tr><th className="pickc"><label className="avsel head" title="Select all on this page"><input type="checkbox" checked={allOnPage} onChange={(e) => pickPage(e.target.checked)} aria-label="Select all on this page" /></label></th><th>Name</th><th>Pool</th><th>Current role</th><th>City</th><th title="Domain years / total years">Experience</th><th>Data status</th><th>Contact</th><th>Profile</th><th>Updated</th></tr></thead><tbody>
          {r.items.map((c) => (
            <tr key={c.id} className={"click" + (picked.has(c.id) ? " picked" : "")} onClick={(e) => { if (!e.target.closest("button,.badge,input,.pickc")) go(href(c.id)); }}>
              <td className="pickc"><PickLogo c={c} picked={picked.has(c.id)} onPick={pick} size="md" /></td>
              <td><b>{c.name}</b></td><td><PoolChip pool={c.pool} /></td>
              <td><div className="rolec"><div><b>{c.current_title || c.standard_title || "-"}</b>{c.current_company && <div className="small muted">{c.current_company}</div>}</div></div></td><td className="cityc">{c.city || "-"}</td>
              <td>{c.domain_experience_years != null || c.total_experience_years != null ? <span className="expchip">{c.domain_experience_years ?? "–"}<small> / {c.total_experience_years ?? "–"} yrs</small></span> : <span className="muted">-</span>}</td><td><StatusChip status={c.data_status} /></td>
              <td className="small contactc">{c.email && <div title={c.email}>{c.email}</div>}{c.phone && <div className="mono">{c.phone}</div>}{!c.email && !c.phone && <span className="muted">-</span>}</td>
              <td><Badge c={c} /></td><td className="small muted">{when(c.updated_at)}</td></tr>
          ))}</tbody></table></div>}
      {r.pages > 1 && <div className="pager">
        <button className="btn sm" type="button" disabled={r.page <= 1} onClick={() => { setF({ ...F, page: r.page - 1 }); scrollTo(0, 0); }}>Previous</button>
        <span>Page {r.page} of {r.pages}</span>
        <button className="btn sm" type="button" disabled={r.page >= r.pages} onClick={() => { setF({ ...F, page: r.page + 1 }); scrollTo(0, 0); }}>Next</button></div>}
    </>
  );
}
