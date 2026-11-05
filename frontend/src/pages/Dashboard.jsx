import { topPools } from "../pools.js";
import SmartSearch from "../components/SmartSearch.jsx";
import { Avatar, BarChart, Donut, ErrorBox, HBars, Kpi, Loading, fmt, tone, when } from "../components/ui.jsx";
import { useCached } from "../context/DataContext.jsx";

const greet = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
const short = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function Dashboard({ user }) {
  const { data: d, error, loading, reload } = useCached("/dashboard");
  if (loading && !d) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const ct = d.contacts || { phones: 0, emails: 0, both: 0, list: [] };
  const tp = topPools(d.pools || {}, 7);
  const shown = tp.shown;
  const other = shown.find((p) => p.other);
  // per-day rows: the small pools are added up into the "N more pools" bar
  const daily = d.daily.map((r) => ({ ...r, label: short(r.date), ...(other ? { [other.name]: other.other.reduce((a, n) => a + (r[n] || 0), 0) } : {}) }));
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
        <div className="panel span2"><h2>New candidates per day</h2><p className="sub">Last 30 days, by the date automation first found them</p>
          <BarChart rows={daily} width={980} height={typeof innerHeight !== "undefined" && innerHeight > 950 && innerWidth > 1100 ? 300 : 170} every={5}
            series={shown.map((p) => ({ key: p.name, name: p.name, color: p.color }))} /></div>
        <div className="panel"><h2>Pool split</h2><p className="sub">{tp.count} pools · biggest first</p>
          <Donut label="candidates" parts={shown.map((p) => ({ label: p.name, value: p.value, color: p.color }))} />
          {other && <details className="allpools"><summary>See all {tp.count} pools</summary>
            <div className="aplist">{tp.all.map(([n, v]) => <a key={n} href={"/candidates?pool=" + encodeURIComponent(n)}><span>{n}</span><b className="mono">{fmt(v)}</b></a>)}</div>
          </details>}</div>
      </div>
      <div className="grid4 drow">
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
        <div className="panel"><h2>Top cities</h2><p className="sub">Where candidates are based</p>
          <HBars items={d.cities} color="var(--brand)" /></div>
      </div>
    </div>
  );
}
