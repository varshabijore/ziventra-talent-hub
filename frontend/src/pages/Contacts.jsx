import { useEffect, useMemo, useState } from "react";
import { ErrorBox, Icon, Kpi, Loading, fmt } from "../components/ui.jsx";
import { qs } from "../api.js";
import { useCached } from "../context/DataContext.jsx";

// Automation page, "Contacts" tab: Apollo (personal mobile) + Treg (work / personal email)
const short = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const istToday = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const day = (iso) => (iso === istToday() ? "Today" : short(iso));
const money = (n) => "$" + Number(n || 0).toFixed(Number(n) && Number(n) < 0.1 ? 3 : 2);
const HEALTH = { ok: ["good", "Working fine"], warning: ["warn", "Needs attention"], error: ["bad", "Failed"] };
const found = (v) => !!v && !["not found", "requested", "-", "none"].includes(String(v).toLowerCase());
const PER = 10;

function lastLine(j) {
  const l = j.last;
  const when = `${day(l.date)}, ${l.time}`;
  if (j.job === "Apollo") return <>Last ran <b>{when}</b>, checked <b>{l.found} candidate{l.found === 1 ? "" : "s"}</b> (~{l.credits} credits). Mobile numbers arrive a few minutes later.</>;
  return <>Last ran <b>{when}</b>, checked <b>{l.checked} candidates</b>: {l.work_found} work and {l.personal_found} personal emails found ({money(l.cost)}).</>;
}

function Card({ j, single }) {
  const l = j.last;
  const [cls, label] = j.paused ? ["mute", "Paused"] : !j.logged ? ["mute", "Not connected yet"] : HEALTH[l.status] || HEALTH.ok;
  return (
    <div className={"panel jcard2 " + cls}>
      <div className="jhead"><h3>{j.job === "Apollo" ? "Apollo · phone" : "Treg · email"}</h3><span className={"pill " + cls}><span className="pdot" />{label}</span></div>
      <p className="jwhat">{j.what}</p>
      {j.paused && <div className="jwarn">⏸ {j.paused}</div>}
      {j.logged ? (
        <>
          <p className="jlast">{lastLine(j)}</p>
          {l.issues.length > 0 && <div className="jwarn">{l.issues.map((x, k) => <div key={k}>⚠ {x}</div>)}</div>}
          <div className="jstats">
            <div><b>{j.runs}{j.expected ? <small> / {j.expected}</small> : null}</b><span>runs {single ? "that day" : "in these days"}</span></div>
            <div><b>{fmt(j.job === "Apollo" ? j.output : j.output)}</b><span>{j.job === "Apollo" ? "people matched" : "emails added to sheet"}</span></div>
            {j.job === "Apollo" ? <div><b>~{fmt(j.credits)}</b><span>Apollo credits</span></div> : <div><b>{money(j.cost)}</b><span>Treg cost</span></div>}
          </div>
        </>
      ) : (
        <p className="jlast muted">{j.job === "Apollo" ? "No Apollo run yet. Import the Apollo workflow in n8n and run it." : "No Treg run yet. Import the Treg workflow in n8n, add the Treg key and run it."}</p>
      )}
      <div className="jfoot"><Icon name="cal" size={13} /> {j.paused ? <><b>Paused</b><span className="muted"> · waiting for the plan upgrade</span></> : j.schedule.length ? <>Runs daily at <b>{j.schedule.join(", ")}</b><span className="muted"> (after Publish in n8n)</span></>
        : <><b>Runs manually</b><span className="muted"> · start it in n8n (limited credits)</span></>}</div>
    </div>
  );
}

const Mail = ({ v, ok }) => found(v) ? <span className="cval">{v}{ok ? <span className="chip c-good tiny">verified</span> : null}</span> : <span className="muted">-</span>;

export default function Contacts({ from, to }) {
  const { data: d, error, loading, reload } = useCached("/contacts" + qs({ from, to }), { keep: true });
  const [show, setShow] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [show, from, to]);
  const rows = useMemo(() => (d?.people || []).filter((p) =>
    !show ? true : show === "phone" ? p.apollo && found(p.apollo.phone) && /^[+\d]/.test(p.apollo.phone)
      : show === "email" ? p.treg && (found(p.treg.work) || found(p.treg.personal)) : !((p.apollo && found(p.apollo.phone)) || (p.treg && (found(p.treg.work) || found(p.treg.personal))))), [d, show]);
  if (loading && !d) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const t = d.totals, single = d.start === d.end;
  const pages = Math.max(1, Math.ceil(rows.length / PER)), pg = Math.min(page, pages - 1);
  const shown = rows.slice(pg * PER, pg * PER + PER);

  return (
    <>
      <section className="kpis">
        <Kpi icon="users" bg="var(--brand-soft)" fg="var(--brand)" label="Candidates checked" value={fmt(t.checked)} sub={`${t.apollo_checked} Apollo · ${t.treg_checked} Treg`} />
        <Kpi icon="phone" bg="var(--sn-soft)" fg="var(--sn)" label="Mobile numbers" value={fmt(t.phones)} sub={t.phones_pending ? `${t.phones_pending} still arriving from Apollo` : "from Apollo"} />
        <Kpi icon="mail" bg="var(--info-soft)" fg="var(--info)" label="Work emails" value={fmt(t.work)} sub={`${t.work_verified} verified · from Treg`} />
        <Kpi icon="mail" bg="var(--ai-soft, var(--brand-soft))" fg="var(--ai, var(--brand))" label="Personal emails" value={fmt(t.personal)} sub="gmail, outlook etc." />
        <Kpi icon="star" bg="var(--warn-soft)" fg="var(--warn)" label="Treg cost" value={money(t.treg_cost)} sub={`${t.emails_added} emails added to the sheet`} />
        <Kpi icon="bolt" bg="var(--warn-soft)" fg="var(--warn)" label="Apollo credits" value={"~" + fmt(t.apollo_credits)} sub="~9 credits per mobile number" />
      </section>

      <section className="jobs two">{d.jobs.map((j) => <Card key={j.job} j={j} single={single} />)}</section>

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="lhead">
          <div><h2>What was found</h2><p className="sub" style={{ margin: 0 }}>Every candidate Apollo or Treg checked on the selected days, newest first</p></div>
          <div className="ltools"><div className="seg" role="group" aria-label="Show">
            {[["", "All"], ["phone", "Got phone"], ["email", "Got email"], ["none", "Nothing found"]].map(([k, l]) =>
              <button key={k || "all"} type="button" aria-pressed={show === k} onClick={() => setShow(k)}>{l}</button>)}
          </div></div>
        </div>
        {rows.length ? (
          <div className="tbl">
            <table className="runtbl ctbl"><thead><tr><th>Candidate</th><th>Mobile (Apollo)</th><th>Work email (Treg)</th><th>Personal email</th><th>Checked</th></tr></thead>
              <tbody>{shown.map((p) => {
                const personal = (p.treg && p.treg.personal) || (p.apollo && p.apollo.personal) || "";
                const ph = p.apollo ? p.apollo.phone : "";
                return (
                  <tr key={p.id}>
                    <td><a href={"/candidate/" + encodeURIComponent(p.id)}><b>{p.name}</b></a><div className="small muted">{p.pool}{p.title ? " · " + p.title : ""}</div></td>
                    <td>{!p.apollo ? <span className="muted small">not checked</span> : ph === "requested" ? <span className="chip c-warn">arriving…</span> : <Mail v={ph} />}</td>
                    <td>{!p.treg ? <span className="muted small">not checked</span> : <Mail v={p.treg.work} ok={p.treg.verified} />}</td>
                    <td><Mail v={personal} /></td>
                    <td className="mono small"><b>{day(p.checked_at.slice(0, 10))}</b><br />{p.checked_at.slice(11)}</td>
                  </tr>);
              })}</tbody></table>
          </div>
        ) : <div className="empty small" style={{ padding: "40px 12px" }}>{d.people.length ? "Nothing matches this filter." : "No candidate was checked by Apollo or Treg on these days."}</div>}
        {rows.length > PER && (
          <div className="pager">
            <span className="small muted">{pg * PER + 1}–{Math.min(rows.length, pg * PER + PER)} of {rows.length}</span>
            <div className="pbtns">
              <button type="button" className="btn sm" disabled={pg === 0} onClick={() => setPage(pg - 1)}>‹ Prev</button>
              <span className="small muted">Page {pg + 1} of {pages}</span>
              <button type="button" className="btn sm" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>Next ›</button>
            </div>
          </div>)}
      </section>
    </>
  );
}
