// "+ Add option" on the Candidates filters: add a new pool (e.g. Python Developer) or a new role,
// so new kinds of candidates can be added and imported, and filtered like the built-in ones.
import { useState } from "react";
import { api } from "../api.js";
import { useData, useCached } from "../context/DataContext.jsx";
import { Icon, Modal, useToast } from "./ui.jsx";

export default function AddOption({ onClose }) {
  const toast = useToast();
  const data = useData();
  const { data: opts, reload } = useCached("/options");
  const [kind, setKind] = useState("pool");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const call = async (body, done) => {
    setBusy(true); setErr("");
    try {
      await api("/options", { method: "POST", body });
      data.invalidate("/options", "/candidates?", "/dashboard", "/search");
      reload(); done();
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };
  const add = (e) => { e.preventDefault(); call({ action: "add", kind, name, desc }, () => { toast(`${kind === "pool" ? "Pool" : "Role"} “${name.trim()}” added`); setName(""); setDesc(""); }); };
  const remove = (k, n) => call({ action: "remove", kind: k, name: n }, () => toast(`“${n}” removed`));
  const list = kind === "pool" ? (opts?.pools || []).map((p) => ({ n: p.name, d: p.desc })) : (opts?.roles || []).map((r) => ({ n: r }));

  return (
    <Modal onClose={() => !busy && onClose()}>
      <h2>Add a filter option</h2>
      <p className="muted" style={{ marginTop: 0 }}>Add a new pool (a kind of talent, like <b>Python Developer</b>) or a new role. It shows up in the filters, in <b>Add candidate</b> and in <b>Import</b>.</p>
      <div className="seg" role="group" aria-label="What to add" style={{ marginBottom: 14 }}>
        {[["pool", "Pool"], ["role", "Role"]].map(([k, l]) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setErr(""); }}>{l}</button>)}
      </div>
      <form onSubmit={add} className="aoform">
        <label className="f"><span>{kind === "pool" ? "Pool name" : "Role name"}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "pool" ? "Python Developer" : "Data Engineer"} maxLength={40} autoFocus /></label>
        {kind === "pool" && <label className="f"><span>Short description (optional)</span>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Django, FastAPI, backend developers" maxLength={80} /></label>}
        {err && <div className="msg err">{err}</div>}
        <div className="actions"><button className="btn" type="button" onClick={onClose} disabled={busy}>Close</button>
          <button className="btn primary" type="submit" disabled={busy || name.trim().length < 2}><Icon name="plus" /> {busy ? "Saving…" : `Add ${kind}`}</button></div>
      </form>
      <div className="aolist">
        <div className="flabel">{kind === "pool" ? "Pools you added" : "Roles you added"}</div>
        {!list.length && <div className="small muted">None yet. The built-in ones (ServiceNow, AI/ML, Salesforce, Workday) are always there.</div>}
        {list.map((x) => (
          <div key={x.n} className="aorow"><div><b>{x.n}</b>{x.d && <div className="small muted">{x.d}</div>}</div>
            <button type="button" className="linkbtn" onClick={() => remove(kind, x.n)} disabled={busy} title="Remove (only when no candidate uses it)">Remove</button></div>
        ))}
      </div>
    </Modal>
  );
}
