import { useState } from "react";
import { go } from "../router.js";
import SmartSearch from "../components/SmartSearch.jsx";
import { Avatar, BarChart, ErrorBox, HBars, Kpi, Loading, fmt, tone, when } from "../components/ui.jsx";
import { useCached } from "../context/DataContext.jsx";

const greet = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
const short = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function Dashboard({ user }) {
  const { data: d, error, loading, reload } = useCached("/dashboard");
  const [pq, setPq] = useState("");   // search box of the Pools table
  if (loading && !d) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const ct = d.contacts || { phones: 0, emails: 0, both: 0, list: [] };
  return (
    <div className="dash">
      <div className="top"><div><h1>{greet()}, {user.name.split(" ")[0]}</h1>
        <p>Talent pool on {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p></div>
        <SmartSearch /></div>
      <section className="kpis">
        <Kpi icon="users" bg="var(--brand-soft)" fg="var(--brand)" label="Total candidates" value={fmt(d.total)} sub={`+${fmt(d.added_today)} added today`} up={d.added_today > 0} />
        <Kpi icon="spark" bg="var(--sn-soft)" fg="var(--sn)" label="Fully enriched" value={fmt(d.enriched)} sub={`+${fmt(d.enriched_today)} today`} up={d.enriched_today > 0} />
        <Kpi icon="refresh" bg="var(--info-soft)" fg="var(--info)" label="Refreshed (30 days)" value={fmt(d.refreshed_30d)} sub="LinkedIn re-checked" />
        <Kpi icon="star" bg="var(--warn-soft)" fg="var(--warn)" label="Avg profile complete" value={d.avg_percent + "%"} sub={`${fmt(d.complete_90)} profiles at 90%+`} />
      </section>
      <div className="grid3 drow">
        <div className="panel span2"><h2>Last 14 days</h2>
          <p className="sub">Candidates found and profiles enriched each day{d.trend?.length ? ` · ${fmt(d.trend.reduce((a, r) => a + r.found, 0))} found, ${fmt(d.trend.reduce((a, r) => a + r.enriched, 0))} enriched` : ""}</p>
          <BarChart rows={(d.trend || []).map((r) => ({ ...r, label: short(r.date) }))} width={980} height={250} every={2} grouped values
            series={[{ key: "found", name: "Found (new)", color: "var(--brand)" }, { key: "enriched", name: "Enriched", color: "var(--sn)" }]} /></div>
        <div className="panel"><h2>Top countries</h2><p className="sub">Where candidates are based · biggest cities</p>
          <div className="ctry">{(d.countries || []).map((c) => (
            <a key={c.label} href={"/candidates?country=" + encodeURIComponent(c.label)}>
              <div className="ctop"><b>{c.label}</b><span className="mono">{fmt(c.value)}<small> · {Math.round((100 * c.value) / (d.total || 1))}%</small></span></div>
              <div className="cbar"><i style={{ width: Math.max(2, (100 * c.value) / ((d.countries || [])[0]?.value || 1)) + "%" }} /></div>
              {c.cities.length > 0 && <div className="small muted">{c.cities.join(", ")}</div>}
            </a>))}</div>
          {!(d.countries || []).length && <div className="empty">No countries yet</div>}</div>
      </div>
      <div className="panel drow ptable">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <div><h2>Pools</h2><p className="sub" style={{ margin: 0 }}>{(d.pool_table || []).length} pools · how big each one is, how fast it grows and how much of it is ready to contact</p></div>
          <input type="search" placeholder="Find a pool…" value={pq} onChange={(e) => setPq(e.target.value)} aria-label="Find a pool" style={{ width: 180 }} /></div>
        <div className="tbl scroll" style={{ "--h": "360px", marginTop: 10 }}>
          <table><thead><tr><th>Pool</th><th className="num">Candidates</th><th className="num">New today</th><th className="num">Last 7 days</th><th>Enriched</th><th className="num">Email</th><th className="num">Phone</th></tr></thead>
            <tbody>{(d.pool_table || []).filter((r) => !pq || r.pool.toLowerCase().includes(pq.toLowerCase())).map((r) => {
              const pct = r.total ? Math.round((100 * r.enriched) / r.total) : 0;
              return (
                <tr key={r.pool} className="click" onClick={() => go("/candidates?pool=" + encodeURIComponent(r.pool))}>
                  <td><b>{r.pool}</b></td><td className="num mono">{fmt(r.total)}</td>
                  <td className={"num mono" + (r.today ? " up" : " muted")}>{r.today ? "+" + fmt(r.today) : "0"}</td>
                  <td className="num mono">{fmt(r.week)}</td>
                  <td><div className="pct"><span className="cbar"><i style={{ width: pct + "%" }} /></span><span className="mono small">{pct}%</span></div></td>
                  <td className="num mono">{fmt(r.email)}</td><td className="num mono">{fmt(r.phone)}</td>
                </tr>);
            })}</tbody></table>
        </div>
      </div>
      <div className="grid3 drow">
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}><h2>Phone numbers found</h2><a className="small" href="/candidates?has_phone=1">View all</a></div>
          <p className="sub">{fmt(ct.phones)} candidates with a phone number</p>
          <div className="fill">{ct.list.slice(0, 5).map((c) => (
            <a key={c.id} className="row" href={"/candidate/" + encodeURIComponent(c.id)}><Avatar c={c} />
              <div className="grow"><div className="t">{c.name}</div><div className="s mono phonev">{c.phone}</div></div>
              <span className="chip tiny">{c.phone_source}</span></a>
          ))}
          </div>{!ct.list.length && <div className="empty">No phone numbers yet</div>}
        </div>
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}><h2>Recently updated</h2><a className="small" href="/candidates">View all</a></div>
          <p className="sub">Latest changes by automation or by you</p>
          <div className="fill">{d.recent.slice(0, 5).map((c) => (
            <a key={c.id} className="row" href={"/candidate/" + encodeURIComponent(c.id)}><Avatar c={c} />
              <div className="grow"><div className="t">{c.name}</div><div className="s">{when(c.updated_at)} · {c.updated_by}</div></div>
              <span className={"chip mono " + tone(c.percent)[1]}>{c.percent}%</span></a>
          ))}
          </div>{!d.recent.length && <div className="empty">No candidates yet</div>}
        </div>
        <div className="panel"><h2>Data status</h2><p className="sub">How far automation has filled each profile</p>
          <HBars items={[{ label: "Discovered", value: d.data_status.Discovered, color: "var(--muted)" }, { label: "Enriched", value: d.data_status.Enriched, color: "var(--sn)" },
            { label: "Refreshed", value: d.data_status.Refreshed, color: "var(--info)" }, { label: "Rejected", value: d.data_status.Rejected, color: "var(--bad)" }]} /></div>
      </div>
    </div>
  );
}
