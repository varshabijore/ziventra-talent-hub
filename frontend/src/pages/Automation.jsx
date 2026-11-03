import { useEffect, useMemo, useState } from "react";
import { ErrorBox, Icon, Kpi, Loading, fmt } from "../components/ui.jsx";
import { qs } from "../api.js";
import { useCached } from "../context/DataContext.jsx";
import { go } from "../router.js";
import Contacts from "./Contacts.jsx";
const split = (x, sep = ", ") => [[x.new_sn, "ServiceNow"], [x.new_ai, "AI/ML"], [x.new_sf, "Salesforce"], [x.new_wd, "Workday"]].filter(([n], i) => n || i < 2).map(([n, l]) => `${n || 0} ${l}`).join(sep);

const JOB_TONE = { Scraping: "c-brand", Enrichment: "c-sn", Refresh: "c-info", Apollo: "c-warn", Sync: "c-ai" };
const istToday = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const nice = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const ST = { ok: ["c-good", "OK"], warning: ["c-warn", "Check"], error: ["c-bad", "Failed"] };
const REASON = { duplicate: "Already in database", not_india: "Outside India", wrong_title: "Wrong title", recruiter: "Recruiter / HR", no_name: "No real name" };
const short = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const day = (iso) => { const t = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); return iso === t ? "Today" : short(iso); };
const money = (n) => "$" + Number(n || 0).toFixed(2);

const HEALTH = { ok: ["good", "Working fine"], warning: ["warn", "Needs attention"], error: ["bad", "Failed"] };

function lastLine(j) {
  const l = j.last;
  const when = `${day(l.date)}, ${l.time}`;
  if (j.job === "Scraping") return <>Last ran <b>{when}</b> and added <b>{l.new} new candidates</b> ({split(l)}).</>;
  if (j.job === "Enrichment") return <>Last ran <b>{when}</b> and enriched <b>{l.enriched} profiles</b>{l.emails_valid ? <>, {l.emails_valid} with a valid email</> : null}.</>;
  if (j.job === "Refresh") return <>Last ran <b>{when}</b> and re-checked <b>{l.checked} profiles</b>; {l.changed} had LinkedIn changes.</>;
  if (j.job === "Apollo") return <>Last ran <b>{when}</b> and matched <b>{l.matched} of {l.found} candidates</b>; {l.emails_added} new email{l.emails_added === 1 ? "" : "s"} added (~{l.credits} credits).</>;
  return <>Last ran <b>{when}</b>: {l.result}.</>;
}

function JobCard({ j, single }) {
  const l = j.last;
  const [cls, label] = !j.logged ? ["mute", "Not connected yet"] : HEALTH[l.status] || HEALTH.ok;
  const nextToday = j.next_run && j.next_run.slice(0, 10) === istToday();
  return (
    <div className={"panel jcard2 " + cls}>
      <div className="jhead">
        <h3>{j.job}</h3>
        <span className={"pill " + cls}><span className="pdot" />{label}</span>
      </div>
      <p className="jwhat">{j.what}</p>
      {j.logged ? (
        <>
          <p className="jlast">{lastLine(j)}</p>
          {l.issues.length > 0 && <div className="jwarn">{l.issues.map((x, k) => <div key={k}>⚠ {x}</div>)}</div>}
          <div className="jstats">
            <div><b>{j.runs}{j.expected ? <small> / {j.expected}</small> : null}</b><span>runs {single ? "that day" : "in these days"}</span></div>
            <div><b>{fmt(j.output)}</b><span>{j.job === "Scraping" ? "new candidates" : j.job === "Enrichment" ? "profiles enriched" : j.job === "Apollo" ? "candidates matched" : "profiles checked"}</span></div>
            {j.job === "Apollo" ? <div><b>~{fmt(j.credits)}</b><span>Apollo credits</span></div> : <div><b>{money(j.cost)}</b><span>Apify cost</span></div>}
          </div>
        </>
      ) : (
        <p className="jlast muted">{j.job === "Apollo" ? "Apollo has not run yet. Import the Apollo workflow in n8n and run it once; the result will appear here." : "This workflow does not save its runs to the database yet. Add the \"Mongo run log\" node in n8n and its runs will appear here."}</p>
      )}
      {j.schedule.length ? <div className="jfoot"><Icon name="cal" size={13} /> Next run <b>{j.next_run ? (nextToday ? "today " : "tomorrow ") + j.next_run.slice(11) : "-"}</b>
        <span className="muted"> · runs daily at {j.schedule.join(", ")}</span></div>
        : <div className="jfoot"><Icon name="cal" size={13} /> <b>Runs manually</b><span className="muted"> · start it in n8n when you want (limited credits)</span></div>}
    </div>
  );
}

export default function Automation({ query }) {
  const from = query.get("from") || istToday();
  const to = query.get("to") || from;
  const tab = query.get("tab") === "contacts" ? "contacts" : "";
  const { data: d, error, loading, reload } = useCached("/automation" + qs({ from, to }), { keep: true });
  const setRange = (f, t) => go("/automation" + qs({ from: f, to: t < f ? f : t, tab: tab || undefined }));
  const setTab = (k) => go("/automation" + qs({ from: query.get("from") || undefined, to: query.get("to") || undefined, tab: k || undefined }));
  const [job, setJob] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [page, setPage] = useState(0);
  const PER = 10;

  useEffect(() => setPage(0), [job, onlyIssues, from, to]);
  const runs = useMemo(() => (d?.runs || []).filter((r) => (!job || r.job === job) && (!onlyIssues || r.status !== "ok")), [d, job, onlyIssues]);
  const single = from === to;
  const range = single ? (from === istToday() ? "today" : nice(from)) : `${nice(from)} – ${nice(to)}`;
  const header = (
    <>
      <div className="top">
        <div><h1>Automation</h1><p>{tab ? "Contact details found" : "What the n8n workflows did"} {single ? "on" : "from"} <b>{range}</b>{d ? <> · updated {d.now.slice(11)}</> : null}</p></div>
        <div className="drange">
          <label className="f">From<input type="date" value={from} max={istToday()} onChange={(e) => e.target.value && setRange(e.target.value, to < e.target.value ? e.target.value : to)} /></label>
          <label className="f">To<input type="date" value={to} min={from} max={istToday()} onChange={(e) => e.target.value && setRange(from, e.target.value)} /></label>
          {(from !== istToday() || to !== istToday()) && <button type="button" className="btn ghost sm" onClick={() => setRange(istToday(), istToday())}>Today</button>}
        </div>
      </div>
      <div className="atabs" role="tablist">
        <button type="button" role="tab" aria-selected={!tab} onClick={() => setTab("")}><Icon name="bolt" size={15} /> Workflows</button>
        <button type="button" role="tab" aria-selected={tab === "contacts"} onClick={() => setTab("contacts")}><Icon name="phone" size={15} /> Contacts · Apollo + Treg</button>
      </div>
    </>
  );
  if (tab) return <>{header}<Contacts from={from} to={to} /></>;
  if (loading && !d) return <>{header}<Loading /></>;
  if (error) return <>{header}<ErrorBox error={error} retry={reload} /></>;
  const w = d.totals;
  const pages = Math.max(1, Math.ceil(runs.length / PER));
  const pg = Math.min(page, pages - 1);
  const shown = runs.slice(pg * PER, pg * PER + PER);
  const issueCount = d.errors.length + d.missed.length + d.issues.length;
  const skipped = Object.values(w.reasons || {}).reduce((a, b) => a + b, 0);
  const reasons = Object.entries(w.reasons || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: REASON[k] || k, value: v }));

  return (
    <>
      {header}

      <section className="kpis">
        <Kpi icon="bolt" bg="var(--brand-soft)" fg="var(--brand)" label="Runs" value={fmt(w.runs)} sub={single ? "workflow runs that day" : `in ${d.days} days`} />
        <Kpi icon="users" bg="var(--brand-soft)" fg="var(--brand)" label="Scraped (new)" value={fmt(w.new)} sub={split(w, " · ")} />
        <Kpi icon="spark" bg="var(--sn-soft)" fg="var(--sn)" label="Enriched" value={fmt(w.enriched)} sub={`${w.emails_valid} with a valid email`} />
        <Kpi icon="refresh" bg="var(--info-soft)" fg="var(--info)" label="Refreshed" value={fmt(w.checked)} sub={`${w.changed} LinkedIn changes`} />
        <Kpi icon="star" bg="var(--warn-soft)" fg="var(--warn)" label="Apify cost" value={money(w.cost)} sub={`${w.dup_rate}% of scraped results were duplicates`} />
        <Kpi icon="x" bg={w.issues ? "var(--bad-soft, rgba(220,38,38,.12))" : "var(--good-soft, rgba(22,163,74,.1))"} fg={w.issues ? "var(--bad)" : "var(--good)"}
          label="Issues" value={fmt(w.issues)} sub={w.issues ? "see the Issues list" : "everything ran fine"} />
      </section>

      <section className="jobs">{d.jobs.map((j) => <JobCard key={j.job} j={j} single={single} />)}</section>

      <div className="dgrid">
        <section className="panel">
          <div className="lhead">
            <div><h2>Run log</h2><p className="sub" style={{ margin: 0 }}>Every n8n run, newest first</p></div>
            <div className="ltools">
              <div className="seg" role="group" aria-label="Job">
                {["", "Scraping", "Enrichment", "Refresh"].map((k) => <button key={k || "all"} type="button" aria-pressed={job === k} onClick={() => setJob(k)}>{k || "All"}</button>)}
              </div>
              <label className="chk"><input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Only issues</label>
            </div>
          </div>
          {runs.length ? (
            <div className="tbl">
              <table className="runtbl"><thead><tr><th>When</th><th>Job</th><th>Status</th><th>Found</th><th>Added</th><th>Rejected</th><th>Cost</th><th>Details</th></tr></thead>
                <tbody>{shown.map((r, i) => (
                  <tr key={r.run_at + r.job + i}>
                    <td className="mono small"><b>{day(r.date)}</b><br />{r.time}</td>
                    <td><span className={"chip " + JOB_TONE[r.job]}>{r.job}</span></td>
                    <td><span className={"chip " + (ST[r.status] || ST.ok)[0]}>{(ST[r.status] || ST.ok)[1]}</span></td>
                    <td className="mono">{r.found || "-"}</td>
                    <td className="mono"><b>{r.job === "Scraping" ? r.new : r.job === "Enrichment" ? r.enriched : r.job === "Refresh" ? r.checked : r.job === "Apollo" ? r.matched : r.synced || "-"}</b>
                      {r.job === "Apollo" ? <div className="small muted">{r.emails_added} emails</div> : null}
                      {r.job === "Scraping" && (r.new_sn || r.new_ai) ? <div className="small muted">{r.new_sn} SN · {r.new_ai} AI</div> : null}
                      {r.job === "Enrichment" && (r.emails_valid || r.emails_risky) ? <div className="small muted">{r.emails_valid} valid email</div> : null}</td>
                    <td className="mono">{r.rejected || 0}{r.duplicates ? <div className="small muted">{r.duplicates} dup</div> : null}</td>
                    <td className="mono small">{r.job === "Apollo" ? `~${r.credits} cr` : money(r.cost)}</td>
                    <td className="small">{r.issues.length ? r.issues.map((x, k) => <div key={k} className="iss">⚠ {x}</div>) : <span className="muted">{r.result}</span>}</td>
                  </tr>))}</tbody></table>
            </div>
          ) : <div className="empty small" style={{ padding: "40px 12px" }}>{d.runs.length ? "No runs match this filter." : "No run log in the database yet. Add the run-log node in n8n (or run import_runs.py once to load the past runs from the sheet)."}</div>}
          {runs.length > PER && (
            <div className="pager">
              <span className="small muted">{pg * PER + 1}–{Math.min(runs.length, pg * PER + PER)} of {runs.length} runs</span>
              <div className="pbtns">
                <button type="button" className="btn sm" disabled={pg === 0} onClick={() => setPage(pg - 1)}>‹ Prev</button>
                {Array.from({ length: pages }, (_, i) => i).filter((i) => i === 0 || i === pages - 1 || Math.abs(i - pg) <= 1).map((i, k, a) => (
                  <span key={i} style={{ display: "contents" }}>{k > 0 && i - a[k - 1] > 1 && <span className="muted">…</span>}
                    <button type="button" className={"btn sm" + (i === pg ? " primary" : "")} aria-current={i === pg ? "page" : undefined} onClick={() => setPage(i)}>{i + 1}</button></span>))}
                <button type="button" className="btn sm" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>Next ›</button>
              </div>
            </div>)}
        </section>

        <div className="stack">
          <section className="panel"><h2>Issues</h2><p className="sub">{issueCount ? `${issueCount} on the selected days` : "Nothing went wrong on the selected days"}</p>
            <div className="scroll" style={{ "--h": "260px" }}>
              {d.errors.map((e, i) => (
                <div key={"e" + i} className="issrow bad"><Icon name="x" size={14} /><div><b>Workflow failed · {e.workflow}</b>
                  <span>{e.at.slice(5)} · node "{e.node}": {e.message}</span>{e.url && <a href={e.url} target="_blank" rel="noopener noreferrer">Open in n8n</a>}</div></div>))}
              {d.missed.map((m, i) => (
                <div key={"m" + i} className="issrow bad"><Icon name="cal" size={14} /><div><b>Missed run · {m.job} {m.time}</b><span>The scheduled run did not log anything. Check n8n Executions.</span></div></div>))}
              {d.issues.map((x, i) => (
                <div key={"i" + i} className={"issrow " + (x.status === "error" ? "bad" : "warn")}><span className="dot" /><div><b>{x.job} · {day(x.run_at.slice(0, 10))} {x.run_at.slice(11)}</b>
                  {x.issues.map((s, k) => <span key={k}>{s}</span>)}</div></div>))}
              {!issueCount && <div className="mbox done"><Icon name="check" size={14} /> All runs healthy</div>}
            </div>
          </section>
          <section className="panel"><h2>Why profiles were skipped</h2>
            <p className="sub">{skipped ? `${fmt(skipped)} search results were not added` : "Scraping results that were not added"}</p>
            {reasons.length ? <div className="skips">{reasons.map((r) => (
              <div key={r.label} className="skip">
                <div className="skiptop"><span>{r.label}</span><b className="mono">{fmt(r.value)}<small> · {Math.round((100 * r.value) / skipped)}%</small></b></div>
                <div className="skipbar"><i style={{ width: Math.max(3, (100 * r.value) / skipped) + "%" }} /></div>
              </div>))}</div> : <div className="small muted">No data</div>}</section>
        </div>
      </div>
    </>
  );
}
