import { useMemo, useState } from "react";
import { qs } from "../api.js";
import { BarChart, ErrorBox, Icon, Loading, PoolChip, StatusChip, fmt, tone, useSmall } from "../components/ui.jsx";
import { useCached } from "../context/DataContext.jsx";
import { go } from "../router.js";

const istToday = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const short = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const JOB = { Scraping: "c-brand", Enrichment: "c-sn", Refresh: "c-info" };

const VIEWS = [
  { id: "new", icon: "users", bg: "var(--brand-soft)", fg: "var(--brand)", label: "Scraped (new)", title: "Candidates found this day",
    empty: "No new candidates were found on this day." },
  { id: "enriched", icon: "spark", bg: "var(--sn-soft)", fg: "var(--sn)", label: "Enriched", title: "Profiles enriched this day",
    empty: "No profiles were enriched on this day." },
  { id: "refreshed", icon: "refresh", bg: "var(--info-soft)", fg: "var(--info)", label: "Refreshed", title: "Profiles re-checked this day",
    empty: "Nothing was re-checked on this day. The refresh job only re-checks profiles that were enriched 30+ days ago, so it starts in late November." },
  { id: "changed", icon: "pen", bg: "var(--warn-soft)", fg: "var(--warn)", label: "LinkedIn changes", title: "LinkedIn changes found this day",
    empty: "No LinkedIn changes on this day. Changes (new company, title or city) appear here once the refresh job starts re-checking profiles." },
];

export default function Daily({ query }) {
  const day = query.get("date") || istToday();
  const view = VIEWS.find((v) => v.id === query.get("view")) || VIEWS[0];
  const [pool, setPool] = useState("");
  const [q, setQ] = useState("");
  const { data: d, error, loading, reload } = useCached("/daily" + qs({ date: day }));
  const small = useSmall();
  const [all5, setAll5] = useState(false);

  const setUrl = (patch) => {
    const p = new URLSearchParams({ date: day, view: view.id, ...patch });
    go("/daily?" + p.toString());
  };

  const rows = useMemo(() => {
    const list = d?.lists?.[view.id] || [];
    const s = q.trim().toLowerCase();
    return list.filter((c) => (!pool || c.pool === pool) &&
      (!s || [c.name, c.current_title, c.current_company, c.city, c.change].join(" ").toLowerCase().includes(s)));
  }, [d, view.id, pool, q]);

  if (loading && !d) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const s = d.summary;
  const count = { new: s.new, enriched: s.enriched, refreshed: s.refreshed, changed: s.changed };
  const sub = {
    new: `${fmt(s.new_sn)} ServiceNow + ${fmt(s.new_ai)} AI/ML`,
    enriched: "full LinkedIn profile added",
    refreshed: "profiles re-checked",
    changed: "company, title, city…",
  };
  const cost = d.runs.reduce((a, r) => a + (Number(r.cost) || 0), 0);
  const all = d.lists?.[view.id] || [];
  const snN = all.filter((c) => c.pool === "ServiceNow").length;

  return (
    <>
      <div className="top">
        <div><h1>Daily record</h1><p>What the automation did on {new Date(day + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p></div>
        <label className="f" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>Day
          <input type="date" value={day} max={istToday()} style={{ width: "auto" }} onChange={(e) => e.target.value && setUrl({ date: e.target.value })} /></label>
      </div>

      <section className="kpis" role="tablist" aria-label="What to show">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={v.id === view.id} className={"kpi kbtn" + (v.id === view.id ? " on" : "")}
            onClick={() => { setPool(""); setQ(""); setAll5(false); setUrl({ view: v.id }); }}>
            <div className="ic" style={{ background: v.bg, color: v.fg }}><Icon name={v.icon} /></div>
            <div><div className="l">{v.label}</div><div className="v">{fmt(count[v.id])}</div><div className="d">{sub[v.id]}</div></div>
          </button>
        ))}
      </section>

      <div className="dgrid">
        <section className="panel">
          <div className="lhead">
            <div><h2>{view.title}</h2><p className="sub" style={{ margin: 0 }}>{fmt(all.length)} total · click a row to open the profile</p></div>
            <div className="ltools">
              <div className="seg" role="group" aria-label="Pool">
                {[["", `All ${all.length}`], ["ServiceNow", `ServiceNow ${snN}`], ["AI/ML", `AI/ML ${all.length - snN}`]].map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={pool === k} onClick={() => setPool(k)}>{l}</button>))}
              </div>
              <input type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search this list" style={{ width: 170 }} />
            </div>
          </div>
          {rows.length ? (
            <div className="tbl scroll" style={{ "--h": "calc(100vh - 360px)" }}>
              <table><thead><tr><th>Name</th><th>Pool</th><th>{view.id === "changed" || view.id === "refreshed" ? "What changed" : "Current role"}</th><th>City</th><th>Status</th><th>Profile</th></tr></thead>
                <tbody>{(small && !all5 ? rows.slice(0, 5) : rows).map((c) => (
                  <tr key={c.id} className="click" onClick={() => go("/candidate/" + encodeURIComponent(c.id))}>
                    <td><b>{c.name}</b></td><td><PoolChip pool={c.pool} /></td>
                    <td>{view.id === "changed" || view.id === "refreshed"
                      ? <span>{c.change || <span className="muted">No change</span>}</span>
                      : <>{c.current_title}<div className="small muted">{c.current_company}</div></>}</td>
                    <td>{c.city}</td><td><StatusChip status={c.data_status} /></td>
                    <td><span className={"chip mono " + tone(c.percent)[1]}>{c.percent}%</span></td>
                  </tr>))}</tbody></table>
            </div>
          ) : null}
          {rows.length > 0 && small && !all5 && rows.length > 5 && <button type="button" className="btn sm viewall" onClick={() => setAll5(true)}>View all {fmt(rows.length)}</button>}
          {!rows.length && <div className="empty small" style={{ padding: "40px 12px" }}>{all.length ? "Nothing matches your search." : view.empty}</div>}
          {view.id === "new" && s.new > 0 && <a className="btn sm" style={{ marginTop: 10 }} href={"/candidates?first_seen=" + day}>Open these {fmt(s.new)} in Candidates (filters, CSV)</a>}
        </section>

        <div className="stack">
          <section className="panel"><h2>Last 14 days</h2><p className="sub">Done by the automation each day</p>
            <BarChart rows={d.series.map((r) => ({ ...r, label: short(r.date) }))} width={520} height={150} every={3}
              series={[{ key: "new_auto", name: "Scraped", color: "var(--brand)" }, { key: "enriched", name: "Enriched", color: "var(--sn)" }, { key: "refreshed", name: "Refreshed", color: "var(--info)" }]} /></section>
          <section className="panel"><h2>Automation runs</h2>
            <p className="sub">Each scheduled n8n job{d.runs.length ? ` · Apify cost $${cost.toFixed(2)}` : ""}</p>
            {d.runs.length ? (
              <div className="runs scroll" style={{ "--h": "220px" }}>
                {d.runs.map((r, i) => (
                  <div key={i} className="run"><span className="mono small">{r.time}</span><span className={"chip " + (JOB[r.job] || "c-mute")}>{r.job}</span>
                    <span className="grow small">{r.result}</span><span className="mono small muted">{r.cost != null ? "$" + Number(r.cost).toFixed(2) : ""}</span></div>
                ))}
              </div>
            ) : <div className="empty small">Run times will show here once n8n writes its run log to the database (setup step 8). The numbers above already come from the candidate data.</div>}
          </section>
        </div>
      </div>
    </>
  );
}
