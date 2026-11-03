// "+ Add option" next to Filters on Candidates: add a new pool (e.g. Python Developer), role, country, city,
// skill or module. Skills and modules can belong to one pool (e.g. "RAG" for AI/ML) or to all pools.
import { useState } from "react";
import { api } from "../api.js";
import { useData, useCached } from "../context/DataContext.jsx";
import { Icon, Modal, useToast } from "./ui.jsx";

const KINDS = [
  ["pool", "Pool", "Python Developer", "A new kind of talent. It shows up in the filters, in Add candidate and in Import."],
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
    call({ action: "add", kind, name, desc, parent }, () => {
      toast(`${label} “${name.trim()}” added${parent ? (needsCountry ? " in " : " for ") + parent : ""}`); setName(""); setDesc("");
    });
  };
  const remove = (x) => call({ action: "remove", kind, name: x.n, parent: x.p || "" }, () => toast(`“${x.n}” removed`));
  const list = {
    pool: (opts?.pools || []).map((p) => ({ n: p.name, d: p.desc })),
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
        {kind === "pool" && <label className="f"><span>Short description (optional)</span>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Django, FastAPI, backend developers" maxLength={80} /></label>}
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
            <button type="button" className="linkbtn" onClick={() => remove(x)} disabled={busy} title="Remove (only when no candidate uses it)">Remove</button></div>
        ))}
      </div>
    </Modal>
  );
}
