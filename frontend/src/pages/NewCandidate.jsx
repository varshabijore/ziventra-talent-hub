// Add one candidate by hand: every field the profile has, in the same groups as the profile page.
import { useState } from "react";
import { api } from "../api.js";
import { Icon, useToast } from "../components/ui.jsx";
import { useData } from "../context/DataContext.jsx";
import { go } from "../router.js";

const SECTIONS = [
  { title: "Basic details", hint: "Name and LinkedIn profile are required", fields: [
    { k: "name", l: "Full name", req: true, ph: "Priya Sharma" },
    { k: "linkedin_url", l: "LinkedIn profile URL", req: true, ph: "https://www.linkedin.com/in/…", type: "url" },
    { k: "city", l: "City", ph: "Pune" },
    { k: "state", l: "State", ph: "Maharashtra" },
    { k: "open_to_work", l: "Open to work", opts: ["Yes", "No", "Unknown"] },
  ] },
  { title: "Work & experience", fields: [
    { k: "current_title", l: "Current title", ph: "ServiceNow Developer" },
    { k: "current_company", l: "Current company", ph: "Infosys" },
    { k: "standard_title", l: "Standard title", ph: "ServiceNow Developer" },
    { k: "seniority", l: "Seniority", opts: ["Intern", "Junior", "Mid", "Senior", "Lead", "Manager"] },
    { k: "domain_experience_years", l: "Domain experience (yrs)", type: "number", ph: "e.g. 3.5", poolLabel: true },
    { k: "total_experience_years", l: "Total experience (yrs)", type: "number", ph: "e.g. 6" },
  ] },
  { title: "Contact", hint: "Used for outreach", fields: [
    { k: "email", l: "Email", ph: "name@gmail.com", type: "email" },
    { k: "phone", l: "Phone", ph: "+91 98xxxxxxxx", type: "tel" },
  ] },
  { title: "Skills", hint: "Separate items with ; (semicolon)", fields: [
    { k: "skills", l: "Skills", area: true, ph: "ITSM; Flow Designer; JavaScript" },
    { k: "modules_specialization", l: "Modules / specialization", area: true, ph: "ITSM; CMDB  or  GenAI; RAG" },
    { k: "certifications", l: "Certifications", area: true, ph: "CSA; CAD" },
  ] },
  { title: "Background", fields: [
    { k: "past_employers", l: "Past employers", area: true, ph: "TCS (2018-2021); Wipro (2021-2023)" },
    { k: "notes", l: "Education & notes", area: true, ph: "B.Tech, Pune University; referred by …" },
  ] },
];

export default function NewCandidate() {
  const toast = useToast();
  const data = useData();
  const [pool, setPool] = useState("");
  const [v, setV] = useState({ open_to_work: "Unknown" });
  const [err, setErr] = useState({});
  const [dup, setDup] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, x) => { setV({ ...v, [k]: x }); if (err[k]) setErr({ ...err, [k]: "" }); };

  const check = () => {
    const e = {};
    if (!pool) e.pool = "Choose a pool";
    if (!String(v.name || "").trim()) e.name = "Name is required";
    if (!/linkedin\.com\/in\/[^/?#\s]+/i.test(v.linkedin_url || "")) e.linkedin_url = "Paste a LinkedIn profile link (linkedin.com/in/…)";
    if (v.email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v.email)) e.email = "Email looks wrong";
    if (v.phone && String(v.phone).replace(/\D/g, "").length < 10) e.phone = "Phone needs at least 10 digits";
    for (const k of ["domain_experience_years", "total_experience_years"]) if (v[k] !== undefined && v[k] !== "" && (isNaN(Number(v[k])) || Number(v[k]) < 0 || Number(v[k]) > 60)) e[k] = "Enter years, e.g. 4.5";
    setErr(e);
    return !Object.keys(e).length;
  };
  const save = async (e) => {
    e.preventDefault();
    setDup(null);
    if (!check()) { document.querySelector(".ferr")?.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
    setBusy(true);
    try {
      const fields = Object.fromEntries(Object.entries(v).filter(([, x]) => String(x ?? "").trim() !== ""));
      if (fields.open_to_work === "Unknown") delete fields.open_to_work;
      const r = await api("/candidates", { method: "POST", body: { pool, fields } });
      data.invalidate("/candidates?", "/dashboard", "/daily");
      toast("Candidate added");
      go("/candidate/" + encodeURIComponent(r.id));
    } catch (ex) {
      if (ex.status === 409 && ex.data?.id) setDup({ id: ex.data.id, msg: ex.message });
      else toast(ex.message, true);
    } finally { setBusy(false); }
  };

  const input = (f) => {
    const props = { id: "n-" + f.k, value: v[f.k] ?? "", onChange: (e) => set(f.k, e.target.value), placeholder: f.ph, "aria-invalid": !!err[f.k] };
    const ctl = f.opts ? <select {...props}>{f.k !== "open_to_work" && <option value="">-</option>}{f.opts.map((o) => <option key={o}>{o}</option>)}</select>
      : f.area ? <textarea rows={2} {...props} />
      : <input {...props} type={f.type === "number" ? "number" : f.type || "text"} step={f.type === "number" ? "0.1" : undefined} min={f.type === "number" ? "0" : undefined} />;
    return (
      <label key={f.k} className={"f" + (f.area ? " full" : "") + (err[f.k] ? " bad" : "")}>
        <span>{f.poolLabel && pool ? `${pool} experience (yrs)` : f.l}{f.req && <em> *</em>}</span>{ctl}
        {err[f.k] && <span className="ferr">{err[f.k]}</span>}
      </label>
    );
  };

  return (
    <form onSubmit={save} noValidate>
      <div className="phead">
        <a className="btn ghost sm" href="/candidates">← Back to candidates</a>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="btn" href="/candidates">Cancel</a>
          <button className="btn primary" type="submit" disabled={busy}><Icon name="check" /> {busy ? "Saving…" : "Save candidate"}</button>
        </div>
      </div>
      <div className="top" style={{ marginTop: 4 }}><div><h1>Add candidate</h1><p>Fill what you know. Anything left empty can be added later from the profile, or by the n8n enrichment.</p></div></div>

      {dup && <div className="msg err">{dup.msg}. <a href={"/candidate/" + encodeURIComponent(dup.id)}>Open that profile</a></div>}

      <section className="panel newc">
        <h2>Pool<em className="req"> *</em></h2>
        <div className="poolpick">
          {["ServiceNow", "AI/ML"].map((p) => (
            <button key={p} type="button" className={"poolopt" + (pool === p ? " on" : "")} aria-pressed={pool === p} onClick={() => { setPool(p); setErr({ ...err, pool: "" }); }}>
              <b>{p}</b><span>{p === "ServiceNow" ? "Developers, admins, architects, consultants" : "ML, GenAI / LLM, data science, MLOps"}</span>
            </button>))}
        </div>
        {err.pool && <span className="ferr">{err.pool}</span>}
      </section>

      <div className="newgrid">
        {SECTIONS.map((s) => (
          <section key={s.title} className={"panel newc" + (["Basic details", "Skills", "Background"].includes(s.title) ? " wide" : "")}>
            <h2>{s.title}</h2>{s.hint && <p className="sub">{s.hint}</p>}
            <div className="form2">{s.fields.map(input)}</div>
          </section>
        ))}
      </div>

      <div className="newfoot">
        <span className="small muted">New candidates start as <b>Discovered</b>; the n8n enrichment can fill their LinkedIn details later. Your entries are never overwritten by the automation.</span>
        <button className="btn primary" type="submit" disabled={busy}><Icon name="check" /> {busy ? "Saving…" : "Save candidate"}</button>
      </div>
    </form>
  );
}
