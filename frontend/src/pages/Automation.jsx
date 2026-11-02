import { useMemo, useState } from "react";
import { BarChart, ErrorBox, HBars, Icon, Kpi, Loading, fmt, useSmall } from "../components/ui.jsx";
import { useCached } from "../context/DataContext.jsx";
import { go } from "../router.js";

const JOB_TONE = { Scraping: "c-brand", Enrichment: "c-sn", Refresh: "c-info", Sync: "c-ai" };
const ST = { ok: ["c-good", "OK"], warning: ["c-warn", "Check"], error: ["c-bad", "Failed"] };
const REASON = { duplicate: "Already in database", not_india: "Outside India", wrong_title: "Wrong title", recruiter: "Recruiter / HR", no_name: "No real name" };
const short = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const day = (iso) => { const t = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); return iso === t ? "Today" : short(iso); };
const money = (n) => "$" + Number(n || 0).toFixed(2);

function JobCard({ j }) {
  const last = j.last;
  const st = last ? ST[last.status] || ST.ok : null;
  return (
    <div className="panel jcard">
      <div className="jtop">
        <span className={"chip " + JOB_TONE[j.job]}>{j.job}</span>
        {st ? <span className={"chip " + st[0]}>{st[1]}</span> : <span className="chip c-mute">No log</span>}
      </div>
      <p className="small muted jwhat">{j.what}</p>
      {j.logged ? (
        <>
          <div className="jline"><span>Last run</span><b>{last.run_at.slice(5)}</b></div>
          <div className="jline"><span>Result</span><b>{last.result}</b></div>
          <div className="jline"><span>Runs today</span><b>{j.runs_today} / {j.expected_today}</b></div>
          <div className="jline"><span>Healthy runs</span><b>{j.health}%</b></div>
        </>
      ) : (
        <div className="msg small">No run log yet. Add the "Mongo run log" node to this n8n workflow and its runs will show here.</div>
      )}
      <div className="jline"><span>Next run</span><b>{j.next_run ? j.next_run.slice(11) + (j.next_run.slice(0, 10) !== new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10) ? " (tomorrow)" : "") : "-"}</b></div>
      <div className="small muted">Schedule: {j.schedule.join(" · ")}</div>
    </div>
  );
}

export default function Automation({ query }) {
  const days = Number(query.get("days")) || 7;
  const { data: d, error, loading, reload } = useCached(`/automation?days=${days}`, { keep: true });
  const [job, setJob] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [all, setAll] = useState(false);
  const small = useSmall();

  const runs = useMemo(() => (d?.runs || []).filter((r) => (!job || r.job === job) && (!onlyIssues || r.status !== "ok")), [d, job, onlyIssues]);
  if (loading && !d) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const t = d.today, w = d.window;
  const shown = small && !all ? runs.slice(0, 5) : runs;
  const issueCount = d.errors.length + d.missed.length + d.issues.length;
  const reasons = Object.entries(w.reasons || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: REASON[k] || k, value: v }));

  return (
    <>
      <div className="top">
        <div><h1>Automation</h1><p>n8n workflows: when they ran, what they brought in, and what went wrong · updated {d.now.slice(11)}</p></div>
        <div className="seg" role="group" aria-label="Period">
          {[1, 7, 14, 30].map((n) => <button key={n} type="button" aria-pressed={days === n} onClick={() => go(`/automation?days=${n}`)}>{n === 1 ? "Today" : `${n} days`}</button>)}
        </div>
      </div>

      <section className="kpis">
        <Kpi icon="bolt" bg="var(--brand-soft)" fg="var(--brand)" label="Runs today" value={fmt(t.runs)} sub={`${fmt(w.runs)} in ${days === 1 ? "today" : days + " days"}`} />
        <Kpi icon="users" bg="var(--brand-soft)" fg="var(--brand)" label="Scraped today (new)" value={fmt(t.new)} sub={`${fmt(w.new)} in period · ${w.dup_rate}% duplicates`} />
        <Kpi icon="spark" bg="var(--sn-soft)" fg="var(--sn)" label="Enriched today" value={fmt(t.enriched)} sub={`${fmt(w.enriched)} in period · ${w.emails_valid} valid emails`} />
        <Kpi icon="refresh" bg="var(--info-soft)" fg="var(--info)" label="Refreshed today" value={fmt(t.checked)} sub="profiles re-checked" />
        <Kpi icon="star" bg="var(--warn-soft)" fg="var(--warn)" label="Apify cost today" value={money(t.cost)} sub={`${money(w.cost)} in period`} />
        <Kpi icon="x" bg={t.issues ? "var(--bad-soft, rgba(220,38,38,.12))" : "var(--good-soft, rgba(22,163,74,.1))"} fg={t.issues ? "var(--bad)" : "var(--good)"}
          label="Issues today" value={fmt(t.issues)} sub={t.issues ? "see the Issues list" : "everything ran fine"} />
      </section>

      <section className="jobs">{d.jobs.map((j) => <JobCard key={j.job} j={j} />)}</section>

      <div className="dgrid">
        <section className="panel">
          <div className="lhead">
            <div><h2>Run log</h2><p className="sub" style={{ margin: 0 }}>Every n8n run, newest first</p></div>
            <div className="ltools">
              <div className="seg" role="group" aria-label="Job">
                {["", "Scraping", "Enrichment", "Refresh", "Sync"].map((k) => <button key={k || "all"} type="button" aria-pressed={job === k} onClick={() => setJob(k)}>{k || "All"}</button>)}
              </div>
              <label className="chk"><input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Only issues</label>
            </div>
          </div>
          {runs.length ? (
            <div className="tbl scroll" style={{ "--h": "calc(100vh - 330px)" }}>
              <table className="runtbl"><thead><tr><th>When</th><th>Job</th><th>Status</th><th>Found</th><th>Added</th><th>Rejected</th><th>Cost</th><th>Details</th></tr></thead>
                <tbody>{shown.map((r, i) => (
                  <tr key={r.run_at + r.job + i}>
                    <td className="mono small"><b>{day(r.date)}</b><br />{r.time}</td>
                    <td><span className={"chip " + JOB_TONE[r.job]}>{r.job}</span></td>
                    <td><span className={"chip " + (ST[r.status] || ST.ok)[0]}>{(ST[r.status] || ST.ok)[1]}</span></td>
                    <td className="mono">{r.found || "-"}</td>
                    <td className="mono"><b>{r.job === "Scraping" ? r.new : r.job === "Enrichment" ? r.enriched : r.job === "Refresh" ? r.checked : r.synced || "-"}</b>
                      {r.job === "Scraping" && (r.new_sn || r.new_ai) ? <div className="small muted">{r.new_sn} SN · {r.new_ai} AI</div> : null}
                      {r.job === "Enrichment" && (r.emails_valid || r.emails_risky) ? <div className="small muted">{r.emails_valid} valid email</div> : null}</td>
                    <td className="mono">{r.rejected || 0}{r.duplicates ? <div className="small muted">{r.duplicates} dup</div> : null}</td>
                    <td className="mono small">{money(r.cost)}</td>
                    <td className="small">{r.issues.length ? r.issues.map((x, k) => <div key={k} className="iss">⚠ {x}</div>) : <span className="muted">{r.result}</span>}</td>
                  </tr>))}</tbody></table>
            </div>
          ) : <div className="empty small" style={{ padding: "40px 12px" }}>{d.runs.length ? "No runs match this filter." : "No run log in the database yet. Add the run-log node in n8n (or run import_runs.py once to load the past runs from the sheet)."}</div>}
          {small && !all && runs.length > 5 && <button type="button" className="btn sm viewall" onClick={() => setAll(true)}>View all {runs.length}</button>}
        </section>

        <div className="stack">
          <section className="panel"><h2>Issues</h2><p className="sub">{issueCount ? `${issueCount} in this period` : "Nothing went wrong in this period"}</p>
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
          <section className="panel"><h2>Per day</h2><p className="sub">New candidates and enriched profiles</p>
            <BarChart rows={d.series.map((r) => ({ ...r, label: short(r.date) }))} width={520} height={140} every={days > 14 ? 5 : days > 7 ? 2 : 1}
              series={[{ key: "new", name: "Scraped (new)", color: "var(--brand)" }, { key: "enriched", name: "Enriched", color: "var(--sn)" }]} /></section>
          <section className="panel"><h2>Why profiles were skipped</h2><p className="sub">Scraping results not added in this period</p>
            {reasons.length ? <HBars items={reasons} color="var(--warn)" /> : <div className="small muted">No data</div>}</section>
        </div>
      </div>
    </>
  );
}
