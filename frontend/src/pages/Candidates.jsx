import { useEffect, useRef, useState } from "react";
import { api, qs } from "../api.js";
import { ExportModal, ImportModal } from "../components/Transfer.jsx";
import AddOption from "../components/AddOption.jsx";
import { Avatar, ErrorBox, Icon, Loading, Modal, PoolChip, StatusChip, fmt, tone, useSmall, useToast, when } from "../components/ui.jsx";
import { useCached, useData } from "../context/DataContext.jsx";
import { go } from "../router.js";
import { POOL_NAMES } from "../pools.js";

const DEFAULT = { q: "", pool: "", country: "", city: "", role: "", skill: "", module: "", bucket: "", data_status: "", min_score: "", updated_within: "", first_seen: "", min_exp: "", max_exp: "",
  open_to_work: false, certified: false, has_email: false, has_phone: false, in_role: false, sort: "updated", dir: "desc", page: 1 };
// filters can come in the address (from the Dashboard smart search): /candidates?pool=Salesforce&city=Pune&has_email=1
const fromQuery = (query) => {
  const f = { ...DEFAULT };
  for (const k of Object.keys(DEFAULT)) if (query.has(k)) f[k] = typeof DEFAULT[k] === "boolean" ? query.get(k) === "1" : query.get(k);
  return f;
};
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
  if (!name) return <span className={"clogo nocomp " + size} title="Company not found"><Icon name="bag" /></span>;
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
  const Line = ({ icon, v, empty, strong, title }) => <div title={title} className={"cline ic-" + icon + (v ? "" : " none") + (strong && v ? " strong" : "")}><span className="cic2"><Icon name={icon} size={13} /></span><span>{v || empty}</span></div>;
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
        <Line icon="pin" title={c.city_guess ? "Approximate: taken from the search, not yet confirmed from the LinkedIn profile" : undefined} v={(c.city_guess && c.city ? "~" : "") + [c.city, c.country && c.country !== "India" ? c.country : c.state].filter(Boolean).join(", ")} empty="Location not added" strong />
        <Line icon="cert" v={c.certifications && String(c.certifications).split(";")[0].trim()} empty="No certification" strong />
      </div>
      <div className="chips"><PoolChip pool={c.pool} /><StatusChip status={c.data_status} />{c.open_to_work === "Yes" && <span className="chip c-good">Open to work</span>}</div>
      <div className="upd">Updated {when(c.updated_at)} · by {c.updated_by}</div>
    </a>
  );
}

export default function Candidates({ query }) {
  const data = useData();
  const [F, setF] = useState(() => fromQuery(query));
  const urlKey = query.toString();
  const [viewPick, setView] = useState(() => store.get("cand_view", "cards"));
  const small = useSmall();
  const phone = useSmall("(max-width: 560px)");
  const view = phone ? "cards" : viewPick; // only phones always get cards; tablets can switch
  const [q, setQ] = useState(F.q);

  // a new search from the Dashboard while this page is open: start again from the address's filters
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const f = fromQuery(new URLSearchParams(urlKey)); setF(f); setQ(f.q);
  }, [urlKey]);
  useEffect(() => { const t = setTimeout(() => setF((f) => (f.q === q ? f : { ...f, q, page: 1 })), 250); return () => clearTimeout(t); }, [q]);


  const { data: r, error, reload } = useCached("/candidates" + qs({ ...F, size: view === "table" ? 10 : small ? 6 : 12 }), { keep: true });
  const set = (k, v) => setF((f) => ({ ...f, [k]: v, ...(k === "country" ? { city: "" } : {}), page: 1 }));
  const reset = () => { setQ(""); setF({ ...DEFAULT }); setPicked(new Set()); if (urlKey) go("/candidates"); };
  const [picked, setPicked] = useState(() => new Set());
  const [modal, setModal] = useState("");
  const [busyDel, setBusyDel] = useState(false);
  const [moreF, setMoreF] = useState(() => store.get("cand_more_filters", "0") === "1");
  const toggleMore = () => setMoreF((v) => { store.set("cand_more_filters", v ? "0" : "1"); return !v; });
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
  const Sel = ({ k, label, opts, disabled, title }) => (
    <select aria-label={label} value={String(F[k])} onChange={(e) => set(k, e.target.value)} disabled={disabled} title={title}>
      <option value="">{label}</option>{opts.map((o) => { const v = o.v ?? o; return <option key={v} value={v}>{o.l ?? o}</option>; })}
    </select>
  );
  const LBL = { role: (v) => v, skill: (v) => "Skill: " + v, module: (v) => "Module: " + v, bucket: (v) => (v === "Unknown" ? "Exp unknown" : v + " yrs exp"), data_status: (v) => v,
    min_score: (v) => v + "%+ complete", min_exp: (v) => v + "+ yrs exp", max_exp: (v) => "up to " + v + " yrs", updated_within: (v) => (v === "1" ? "Updated today" : `Updated in ${v} days`) };
  const activeChips = [...Object.keys(LBL).filter((k) => F[k]).map((k) => [k, LBL[k](F[k])]), ...CHECKS.filter(([k]) => F[k])];
  const moreCount = activeChips.length;
  const activeCount = moreCount + (F.pool ? 1 : 0) + (F.city ? 1 : 0) + (F.country ? 1 : 0) + (F.q ? 1 : 0);
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
      {modal === "option" && <AddOption onClose={() => { setModal(""); reload(); }} />}
      {modal === "import" && <ImportModal onClose={() => setModal("")} onDone={() => { data.invalidate("/candidates?", "/dashboard", "/daily"); reload(); }} />}
      <section className="kpis mini">
        <K hl l="Candidates" v={fmt(s.total)} sub={s.total === s.pool_total ? (F.pool ? F.pool + " only" : "all pools") : `of ${fmt(s.pool_total)} in ${F.pool || "pool"}`} />
        <K l={`In a ${F.pool || "matching"} role`} v={fmt(s.in_role)} sub="current title matches" />
        <K l="Full profiles" v={fmt(s.enriched)} sub="enriched or refreshed" />
        <K l="Certified" v={fmt(s.certified)} sub="1+ certification" />
        <K l="Open to work" v={fmt(s.open_to_work)} sub="LinkedIn #OpenToWork" />
        <K l="Contactable" v={fmt(s.contactable)} sub="email or phone found" />
        <K l="Cities" v={fmt(s.cities)} sub={s.countries > 1 ? `in ${fmt(s.countries)} countries` : "where they are based"} />
        <K l="Avg profile" v={s.avg_percent + "%"} sub="completeness" />
      </section>
      <section className="panel fpanel">
        <div className="frow">
          <div className="fsearch"><Icon name="search" size={16} />
            <input type="search" placeholder="Search name, title, company, skill, module…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
            {q && <button type="button" className="fclear" onClick={() => setQ("")} aria-label="Clear search">✕</button>}</div>
          <Sel k="pool" label="All pools" opts={f.pools || POOL_NAMES} />
          <Sel k="country" label="All countries" opts={f.countries || []} />
          <Sel k="city" label="All cities" opts={F.city && !(f.cities || []).includes(F.city) ? [F.city, ...(f.cities || [])] : (f.cities || [])} />
          <button type="button" className={"btn fbtn" + (moreF ? " on" : "")} onClick={toggleMore} aria-expanded={moreF}>
            <Icon name="sliders" size={16} /><span>Filters</span>{moreCount > 0 && <b className="fcount">{moreCount}</b>}<Icon name="down" size={14} /></button>
          <button type="button" className="btn fbtn" onClick={() => setModal("option")} title="Add a new pool, role, country, city, skill or module">
            <Icon name="plus" size={16} /><span>Add option</span></button>
          {activeCount > 0 && <button className="linkbtn freset" type="button" onClick={reset}>Clear all</button>}
        </div>
        {moreF && (
          <div className="fmore">
            <div className="fgrid">
              <label className="fl">Role<Sel k="role" label="All roles" opts={f.roles} /></label>
              <label className="fl">Experience<Sel k="bucket" label="All experience" opts={f.buckets.map((b) => ({ v: b, l: b === "Unknown" ? "Unknown" : b + " yrs" }))} /></label>
              <label className="fl">Data status<Sel k="data_status" label="Any status" opts={f.data_status} /></label>
              <label className="fl">Profile complete<Sel k="min_score" label="Any profile %" opts={[{ v: "90", l: "90%+ complete" }, { v: "70", l: "70%+ complete" }, { v: "50", l: "50%+ complete" }]} /></label>
              <label className="fl">Updated<Sel k="updated_within" label="Any time" opts={[{ v: "1", l: "Updated today" }, { v: "7", l: "Last 7 days" }, { v: "30", l: "Last 30 days" }]} /></label>
              <label className="fl">Skill<Sel k="skill" label="Any skill" opts={F.skill && !(f.skills || []).includes(F.skill) ? [F.skill, ...(f.skills || [])] : (f.skills || [])} /></label>
              <label className="fl">Module<Sel k="module" label="Any module" opts={F.module && !(f.modules || []).includes(F.module) ? [F.module, ...(f.modules || [])] : (f.modules || [])} /></label>
            </div>
            <div className="fpills"><span className="flabel">Only show</span>
              {CHECKS.map(([k, l]) => <button key={k} type="button" className={"fpill" + (F[k] ? " on" : "")} aria-pressed={!!F[k]} onClick={() => set(k, !F[k])}>{F[k] && <Icon name="check" size={13} />}{l}</button>)}
            </div>
          </div>
        )}
        {!moreF && moreCount > 0 && (
          <div className="factive">{activeChips.map(([k, l]) => <span key={k} className="fchip">{l}<button type="button" onClick={() => set(k, DEFAULT[k])} aria-label={"Remove " + l}>✕</button></span>)}</div>
        )}
        {F.first_seen && <div className="factive"><span className="fchip">Found on {F.first_seen}<button type="button" aria-label="Clear day filter" onClick={() => { set("first_seen", ""); go("/candidates"); }}>✕</button></span></div>}
      </section>
      <div className="listhead"><span className="small muted">Showing {fmt(from)}–{fmt((r.page - 1) * r.size + r.items.length)} of {fmt(s.total)}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select aria-label="Sort" style={{ width: "auto" }} value={F.sort} onChange={(e) => setF({ ...F, sort: e.target.value, dir: e.target.value === "name" ? "asc" : "desc", page: 1 })}>
            <option value="updated">Recently updated</option><option value="first_seen">Newest found</option><option value="score">Profile %</option>
            <option value="exp">Domain experience</option><option value="name">Name</option></select>
          {!phone && <div className="seg vtoggle" role="group" aria-label="View">
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
              <td><div className="rolec"><div><b>{c.current_title || c.standard_title || "-"}</b>{c.current_company && <div className="small muted">{c.current_company}</div>}</div></div></td><td className="cityc" title={c.city_guess ? "Approximate: taken from the search" : undefined}>{c.city ? (c.city_guess ? "~" : "") + c.city : "-"}{c.country && c.country !== "India" && <div className="small muted">{c.country}</div>}</td>
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
