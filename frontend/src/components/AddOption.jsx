// "+ Add option" next to Filters on Candidates: add a new pool (e.g. Python Developer), role, country, city,
// skill or module. Skills and modules can belong to one pool (e.g. "RAG" for AI/ML) or to all pools.
import { useState } from "react";
import { api } from "../api.js";
import { useData, useCached } from "../context/DataContext.jsx";
import { Icon, Modal, useToast } from "./ui.jsx";

const KINDS = [
  ["pool", "Pool", "MS Fabric Architect", "A new kind of talent. It shows up in the filters, Add candidate and Import, and n8n starts finding people for it in the next hourly run."],
  ["role", "Role", "Data Engineer", "A job role inside a pool, like Developer or Architect."],
  ["country", "Country", "Germany", "A country to filter by and to pick on a candidate."],
  ["city", "City", "Hyderabad", "A city inside a country."],
  ["skill", "Skill", "FastAPI", "A skill to filter by. Pick a pool, or leave it for all pools."],
  ["module", "Module", "RAG", "A module or specialization, e.g. ITSM for ServiceNow or RAG for AI/ML."],
];

export default function AddOption({ onClose }) {
  const toast = useToast();
  const data = useData();
  const { data: opts, reload } = useCached("/options");
  const [kind, setKind] = useState("pool");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [parent, setParent] = useState("");
  const [titles, setTitles] = useState("");
  const [keywords, setKeywords] = useState("");
  const [modules, setModules] = useState("");
  const [scrape, setScrape] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [, label, example, help] = KINDS.find((k) => k[0] === kind);
  const needsCountry = kind === "city";
  const hasPool = kind === "skill" || kind === "module";

  const call = async (body, done) => {
    setBusy(true); setErr("");
    try {
      await api("/options", { method: "POST", body });
      data.invalidate("/options", "/candidates?", "/dashboard", "/search");
      reload(); done();
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };
  const add = (e) => {
    e.preventDefault();
    const extra = kind === "pool" ? { titles, keywords, modules, scrape } : {};
    call({ action: "add", kind, name, desc, parent, ...extra }, () => {
      toast(`${label} “${name.trim()}” added${parent ? (needsCountry ? " in " : " for ") + parent : ""}${kind === "pool" && scrape ? ". Scraping starts in the next hourly run" : ""}`);
      setName(""); setDesc(""); setTitles(""); setKeywords(""); setModules("");
    });
  };
  const toggleScrape = (x) => call({ action: "update", kind: "pool", name: x.n, scrape: !x.on }, () => toast(`Scraping ${x.on ? "paused" : "on"} for “${x.n}”`));
  const remove = (x) => call({ action: "remove", kind, name: x.n, parent: x.p || "" }, () => toast(`“${x.n}” removed`));
  const list = {
    pool: (opts?.pools || []).map((p) => ({ n: p.name, on: p.scrape !== false, pool: true,
      d: [p.desc, p.titles?.length ? `Searches: ${p.titles.join(", ")}` : "", p.keywords?.length ? `Must mention: ${p.keywords.join(", ")}` : ""].filter(Boolean).join(" · ") })),
    role: (opts?.roles || []).map((r) => ({ n: r })),
    country: (opts?.countries || []).map((c) => ({ n: c })),
    city: (opts?.cities || []).map((c) => ({ n: c.name, p: c.country, d: c.country })),
    skill: (opts?.skills || []).map((x) => ({ n: x.name, p: x.pool, d: x.pool || "All pools" })),
    module: (opts?.modules || []).map((x) => ({ n: x.name, p: x.pool, d: x.pool || "All pools" })),
  }[kind];
  const pick = (k) => { setKind(k); setErr(""); setParent(""); };

  return (
    <Modal onClose={() => !busy && onClose()}>
      <h2>Add a filter option</h2>
      <div className="aotabs" role="group" aria-label="What to add">
        {KINDS.map(([k, l]) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => pick(k)}>{l}</button>)}
      </div>
      <p className="muted small" style={{ margin: "0 0 12px" }}>{help}</p>
      <form onSubmit={add} className="aoform">
        {needsCountry && <label className="f"><span>Country</span>
          <select value={parent} onChange={(e) => setParent(e.target.value)} required>
            <option value="">Choose a country</option>{(opts?.all_countries || []).map((c) => <option key={c}>{c}</option>)}
          </select></label>}
        {hasPool && <label className="f"><span>Pool</span>
          <select value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">All pools</option>{(opts?.all_pools || []).map((p) => <option key={p}>{p}</option>)}
          </select></label>}
        <label className="f"><span>{label} name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={example} maxLength={40} autoFocus /></label>
        {kind === "pool" && <>
          <label className="f"><span>Job titles to search on LinkedIn <em className="muted">(one per line or comma; empty = the pool name)</em></span>
            <textarea rows={3} value={titles} onChange={(e) => setTitles(e.target.value)} placeholder={"Microsoft Fabric Architect\nFabric Data Engineer\nPower BI Architect"} /></label>
          <label className="f"><span>Words the profile must mention <em className="muted">(optional; default from the name, e.g. “fabric”)</em></span>
            <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="fabric, onelake, power bi" /></label>
          <label className="f"><span>Modules / skills to tag <em className="muted">(optional)</em></span>
            <input value={modules} onChange={(e) => setModules(e.target.value)} placeholder="OneLake, Lakehouse, Data Factory, Power BI" /></label>
          <label className="f"><span>Short description (optional)</span>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Microsoft Fabric / data platform architects" maxLength={80} /></label>
          <label className="aocheck"><input type="checkbox" checked={scrape} onChange={(e) => setScrape(e.target.checked)} /> Start finding candidates for this pool automatically (n8n, every hour)</label>
        </>}
        {err && <div className="msg err">{err}</div>}
        <div className="actions"><button className="btn" type="button" onClick={onClose} disabled={busy}>Close</button>
          <button className="btn primary" type="submit" disabled={busy || name.trim().length < 2 || (needsCountry && !parent)}>
            <Icon name="plus" /> {busy ? "Saving…" : `Add ${label.toLowerCase()}`}</button></div>
      </form>
      <div className="aolist">
        <div className="flabel">{label === "City" ? "Cities" : label === "Country" ? "Countries" : label + "s"} you added</div>
        {!list.length && <div className="small muted">None yet. The ones already in the data always show up in the filters.</div>}
        {list.map((x) => (
          <div key={x.n + "|" + (x.p || "")} className="aorow"><div><b>{x.n}</b>{x.d && <div className="small muted">{x.d}</div>}</div>
            <div className="aobtns">{x.pool && <button type="button" className="linkbtn" onClick={() => toggleScrape(x)} disabled={busy}>{x.on ? "Pause scraping" : "Start scraping"}</button>}
              <button type="button" className="linkbtn" onClick={() => remove(x)} disabled={busy} title="Remove (only when no candidate uses it)">Remove</button></div></div>
        ))}
      </div>
    </Modal>
  );
}
