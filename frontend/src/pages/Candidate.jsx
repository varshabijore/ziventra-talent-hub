import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Avatar, ErrorBox, Icon, Loading, PoolChip, Ring, StatusChip, tone, useToast, when } from "../components/ui.jsx";
import { useCached, useData } from "../context/DataContext.jsx";

const EMPTY = ["-", "Not found", "Not collected"];
const isEmpty = (v) => v === null || v === undefined || String(v).trim() === "" || EMPTY.includes(String(v).trim());
const str = (v) => (isEmpty(v) ? "" : String(v));
const split = (v) => str(v).split(/\s*[;|]\s*/).map((x) => x.trim()).filter(Boolean);

// every field the page can edit, in the card where it lives
const BASIC = ["name", "phone", "email", "linkedin_url", "city", "state", "open_to_work"];
const WORK = ["current_title", "current_company", "standard_title", "seniority", "domain_experience_years", "total_experience_years"];
const SKILLS = ["skills", "modules_specialization", "certifications"];
const BACKGROUND = ["past_employers", "notes"];
const ALL = [...BASIC, ...WORK, ...SKILLS, ...BACKGROUND];

const Missing = () => <span className="miss">Missing</span>;

// What is still missing, shown right under the % ring in the left card. Filling a field removes it from this list.
function MissingBox({ c, onFill, editing }) {
  const pts = Object.fromEntries(c.fields.map((f) => [f.key, f.points]));
  const todo = [...(c.missing || [])].sort((a, b) => b.lost - a.lost);
  if (!todo.length) return <div className="mbox done"><Icon name="check" size={14} /> Profile complete, nothing missing</div>;
  return (
    <div className="mbox">
      <div className="mtitle">Incomplete · {todo.length} item{todo.length > 1 ? "s" : ""} missing</div>
      <ul>{todo.map((m) => {
        const part = m.lost < (pts[m.key] || m.lost);
        return (
          <li key={m.key + m.label} className={part ? "part" : ""}>
            <span className="cic">{part ? "!" : "✗"}</span>
            <div className="grow"><b>{m.label}</b><span>{m.why}</span></div>
            <span className="pts">−{m.lost}</span>
            {!editing && <button type="button" className="addl" onClick={() => onFill(m.key)}>Add</button>}
          </li>);
      })}</ul>
    </div>
  );
}

export default function Candidate({ id, query }) {
  const toast = useToast();
  const data = useData();
  const { data: c, error, loading, reload, setData } = useCached("/candidates/" + encodeURIComponent(id));
  const [draft, setDraft] = useState(null); // null = view mode
  const [busy, setBusy] = useState(false);
  const focusKey = useRef(null);
  const filled = useRef(false);

  const startEdit = (key) => {
    setDraft(Object.fromEntries(ALL.map((k) => [k, str(c[k])])));
    focusKey.current = key || null;
  };
  useEffect(() => {
    if (!draft || !focusKey.current) return;
    const el = document.getElementById("f-" + focusKey.current);
    focusKey.current = null;
    if (el) { el.focus(); el.scrollIntoView({ block: "center", behavior: "smooth" }); }
  }, [draft]);
  useEffect(() => {
    if (c && location.hash === "#complete") setTimeout(() => document.getElementById("complete")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }, [c?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (c && !filled.current && query.get("fill")) { filled.current = true; startEdit(c.missing?.[0]?.key); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, query]);

  if (loading && !c) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;

  const meta = Object.fromEntries([...c.fields, ...c.extra_fields].map((f) => [f.key, f]));
  const label = (k) => meta[k]?.label || k;

  const save = async () => {
    const changes = {};
    for (const k of ALL) if ((draft[k] ?? "").trim() !== str(c[k]).trim()) changes[k] = (draft[k] ?? "").trim();
    if (!Object.keys(changes).length) { setDraft(null); return; }
    setBusy(true);
    try {
      const next = await api("/candidates/" + encodeURIComponent(c.id), { method: "PATCH", body: { changes, base: c.updated_at } });
      setData(next); setDraft(null); data.invalidate("/dashboard", "/daily", "/candidates?"); toast(`Saved ${Object.keys(changes).length} field(s) · profile ${next.percent}% complete`);
    } catch (ex) {
      toast(ex.message, true);
      if (ex.status === 409) { setDraft(null); reload(); }
    } finally { setBusy(false); }
  };

  // one input for a field (edit mode)
  const inp = (k, area, full) => {
    const f = meta[k] || {};
    const props = { id: "f-" + k, value: draft[k] ?? "", onChange: (e) => setDraft({ ...draft, [k]: e.target.value }) };
    const ctl = f.options ? <select {...props}><option value="">-</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
      : area || f.type === "textarea" ? <textarea rows={3} {...props} />
      : <input {...props} type={{ number: "number", email: "email", url: "url" }[f.type] || "text"} step={f.type === "number" ? "0.1" : undefined} min={f.type === "number" ? "0" : undefined} />;
    return <label key={k} className={"f" + (full ? " full" : "")}>{f.label || k}{ctl}</label>;
  };
  const copy = async (v) => { try { await navigator.clipboard.writeText(v); toast("Copied"); } catch { toast("Select the text to copy it", true); } };
  const ContactRow = ({ icon, k, children }) => (
    <div className="crow"><Icon name={icon} /><div className="grow">{isEmpty(c[k]) ? <span className="miss">{label(k)} missing</span> : children}</div>
      {!isEmpty(c[k]) && (k === "phone" || k === "email") && <button type="button" className="chip c-mute" onClick={() => copy(String(c[k]))}>Copy</button>}</div>
  );
  const Fact = ({ k }) => <div className="fact"><span>{label(k)}</span><b>{isEmpty(c[k]) ? <Missing /> : String(c[k])}</b></div>;
  const Chips = ({ k }) => (
    <div className="sec"><h4>{label(k)}</h4>
      {split(c[k]).length ? <div className="chips">{split(c[k]).map((x, i) => <span key={i} className="chip c-mute tag">{x}</span>)}</div> : <Missing />}</div>
  );
  const editing = !!draft;

  return (
    <>
      <div className="phead">
        <a className="btn ghost sm" href="/candidates">← Back to candidates</a>
        {editing
          ? <div style={{ display: "flex", gap: 8 }}><button className="btn" type="button" onClick={() => setDraft(null)} disabled={busy}>Cancel</button>
              <button className="btn primary" type="button" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></div>
          : <button className="btn primary" type="button" onClick={() => startEdit()}><Icon name="pen" /> Edit profile</button>}
      </div>

      <div className="cprofile">
        {/* 1. summary + basic info */}
        <aside className="panel pcard2" id="complete">
          <div className="who">
            <Avatar c={c} />
            <div style={{ minWidth: 0 }}><h2>{c.name}</h2>
              <div className="muted small">{c.current_title || c.standard_title || "Title missing"}{c.current_company ? " at " + c.current_company : ""}</div></div>
          </div>
          <div className="chips"><PoolChip pool={c.pool} /><StatusChip status={c.data_status} />{c.open_to_work === "Yes" && <span className="chip c-good">Open to work</span>}</div>
          <div className="scoreline">
            <Ring percent={c.percent} big />
            <div className="stats2">
              <div className="stat"><b className="mono">{c.total_experience_years ?? "-"}</b><span>Total yrs</span></div>
              <div className="stat"><b className="mono">{c.domain_experience_years ?? "-"}</b><span>{c.pool} yrs</span></div></div>
          </div>


          <MissingBox c={c} onFill={(k) => startEdit(k)} editing={editing} />

          <h3 className="ctitle">Contact &amp; basic info</h3>
          {editing ? (
            <div className="form1">{BASIC.map((k) => inp(k))}</div>
          ) : (
            <div className="clist">
              <ContactRow icon="phone" k="phone">{c.phone}</ContactRow>
              <ContactRow icon="mail" k="email">{c.email}</ContactRow>
              <ContactRow icon="link" k="linkedin_url"><a href={c.linkedin_url} target="_blank" rel="noopener noreferrer">{String(c.linkedin_url).replace(/^https?:\/\/(www\.)?/, "")}</a></ContactRow>
              <ContactRow icon="pin" k="city">{[c.city, str(c.state)].filter(Boolean).join(", ")}</ContactRow>
              <div className="crow"><Icon name="bag" /><div className="grow">Open to work: <b>{str(c.open_to_work) || "Unknown"}</b></div></div>
            </div>
          )}
          <div className="foot small muted">
            <div>Data status <b>{c.data_status}</b> is set by the automation.</div>
            <div>Last updated {when(c.updated_at)} by {c.updated_by}.</div>
            {c.first_seen && <div>First found {when(String(c.first_seen).slice(0, 10))}{c.source_flow ? " via " + c.source_flow : ""}.</div>}
          </div>
        </aside>

        <div className="cmain">
          {/* 2. experience + skills */}
          <section className="panel">
            <h2>Experience &amp; skills</h2>
            {editing ? (
              <div className="form2">{WORK.map((k) => inp(k))}
                {SKILLS.map((k) => inp(k, true, true))}
                <p className="small muted full" style={{ margin: 0 }}>Separate items with ; (semicolon)</p></div>
            ) : (
              <>
                <div className="facts">{["current_title", "current_company", "standard_title", "seniority"].map((k) => <Fact key={k} k={k} />)}</div>
                {SKILLS.map((k) => <Chips key={k} k={k} />)}
              </>
            )}
          </section>

          <div className="cgrid">
            {/* 3. background */}
            <section className="panel">
              <h2>Background</h2>
              {editing ? (
                <div className="form1">{BACKGROUND.map((k) => inp(k, true))}</div>
              ) : (
                <>
                  <div className="sec"><h4>Past employers</h4>
                    {split(c.past_employers).length ? <ul className="lines">{split(c.past_employers).map((x, i) => <li key={i}>{x}</li>)}</ul> : <Missing />}</div>
                  <div className="sec"><h4>Education &amp; notes</h4>
                    {split(c.notes).length ? <ul className="lines">{split(c.notes).map((x, i) => <li key={i}>{x.replace(/^Edu:\s*/i, "")}</li>)}</ul> : <Missing />}</div>
                </>
              )}
            </section>
            {/* 4. history */}
            <section className="panel">
              <h2>History</h2>
              <div className="timeline scroll" style={{ "--h": "220px" }}>
                {c.history.map((h, i) => (
                  <div key={i} className="hrow"><div className="small muted mono">{String(h.at).slice(0, 10)}</div>
                    <div><span className={"chip " + (h.kind === "auto" ? "c-info" : "c-brand")}>{h.by}</span><div className="small" style={{ marginTop: 4 }}>{h.text}</div></div></div>
                ))}
                {!c.history.length && <span className="muted">No history yet</span>}
              </div>
            </section>

          </div>


        </div>
      </div>
    </>
  );
}
