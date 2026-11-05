import { useState } from "react";
import { go } from "../router.js";
import SmartSearch from "../components/SmartSearch.jsx";
import { Avatar, BarChart, ErrorBox, Kpi, Loading, fmt, tone, when } from "../components/ui.jsx";
import { useCached } from "../context/DataContext.jsx";

const greet = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
const short = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

// Pools table views: what a recruiter wants to know first
const VIEWS = [
  ["big", "Biggest", (a, b) => b.total - a.total],
  ["growing", "Growing fastest", (a, b) => b.week - a.week || b.total - a.total],
  ["behind", "Needs enrichment", (a, b) => pct(a.enriched, a.total) - pct(b.enriched, b.total) || b.total - a.total],
];
const TOP = 8;

function Pools({ rows }) {
  const [view, setView] = useState("big");
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const sort = VIEWS.find((v) => v[0] === view)[2];
  const list = rows.filter((r) => !q || r.pool.toLowerCase().includes(q.toLowerCase())).sort(sort);
  const shown = all || q ? list : list.slice(0, TOP);
  return (
    <div className="panel pools2">
      <div className="phead2">
        <div><h2>Pools</h2><p className="sub">{rows.length} pools · click a pool to open its candidates</p></div>
        <input type="search" placeholder="Find a pool…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a pool" />
      </div>
      <div className="seg ptabs" role="group" aria-label="Sort pools">
        {VIEWS.map(([k, l]) => <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}>{l}</button>)}
      </div>
      <div className={"tbl" + (all ? " scroll" : "")} style={all ? { "--h": "460px" } : undefined}>
        <table><thead><tr><th>Pool</th><th className="num">Candidates</th><th className="num">This week</th><th>Enriched</th><th className="num">Ready to contact</th></tr></thead>
          <tbody>{shown.map((r) => {
            const e = pct(r.enriched, r.total);
            return (
              <tr key={r.pool} className="click" onClick={() => go("/candidates?pool=" + encodeURIComponent(r.pool))}>
                <td><b className="pname">{r.pool}</b>{r.today > 0 && <span className="chip tiny c-good">+{fmt(r.today)} today</span>}</td>
                <td className="num mono">{fmt(r.total)}</td>
                <td className={"num mono" + (r.week ? "" : " muted")}>{r.week ? "+" + fmt(r.week) : "0"}</td>
                <td><div className="pct"><span className="cbar"><i style={{ width: e + "%", background: e < 15 ? "var(--warn)" : "var(--sn)" }} /></span><span className="mono small">{e}%</span></div></td>
                <td className="num"><b className="mono">{fmt(r.contact)}</b><div className="small muted">{fmt(r.email)} email · {fmt(r.phone)} phone</div></td>
              </tr>);
          })}</tbody></table>
        {!shown.length && <div className="empty small">No pool matches “{q}”.</div>}
      </div>
      {!q && list.length > TOP && <button type="button" className="btn sm viewall" onClick={() => setAll(!all)}>{all ? "Show top " + TOP : `Show all ${list.length} pools`}</button>}
    </div>
  );
}

export default function Dashboard({ user }) {
  const { data: d, error, loading, reload } = useCached("/dashboard");
  if (loading && !d) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const ct = d.contacts || { phones: 0, emails: 0, both: 0, list: [] };
  const trend = d.trend || [];
  const countries = (d.countries || []).slice(0, 6);
  const otherC = d.total - countries.reduce((a, c) => a + c.value, 0);
  const funnel = [
    ["Found", d.total, "var(--brand)", "/candidates"],
    ["Enriched (full profile)", d.enriched, "var(--sn)", "/candidates?data_status=Enriched"],
    ["Has an email", ct.emails, "var(--info)", "/candidates?has_email=1"],
    ["Has a phone", ct.phones, "var(--warn)", "/candidates?has_phone=1"],
  ];
  return (
    <div className="dash dash2">
      <div className="top"><div><h1>{greet()}, {user.name.split(" ")[0]}</h1>
        <p>Talent pool on {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p></div>
        <SmartSearch /></div>

      <section className="kpis">
        <Kpi icon="users" bg="var(--brand-soft)" fg="var(--brand)" label="Total candidates" value={fmt(d.total)} sub={`+${fmt(d.added_today)} today`} up={d.added_today > 0} />
        <Kpi icon="cal" bg="var(--info-soft)" fg="var(--info)" label="New this week" value={fmt(d.week ?? 0)} sub="found in the last 7 days" />
        <Kpi icon="spark" bg="var(--sn-soft)" fg="var(--sn)" label="Enriched" value={fmt(d.enriched)} sub={`${pct(d.enriched, d.total)}% of all · +${fmt(d.enriched_today)} today`} up={d.enriched_today > 0} />
        <Kpi icon="phone" bg="var(--warn-soft)" fg="var(--warn)" label="Ready to contact" value={fmt(d.contactable ?? 0)} sub={`have an email or phone · ${pct(d.contactable ?? 0, d.total)}%`} />
      </section>

      <div className="grid3 r1">
        <div className="panel span2"><h2>Activity · last 14 days</h2>
          <p className="sub">{fmt(trend.reduce((a, r) => a + r.found, 0))} candidates found and {fmt(trend.reduce((a, r) => a + r.enriched, 0))} profiles enriched</p>
          <BarChart rows={trend.map((r) => ({ ...r, label: short(r.date) }))} width={980} height={265} every={2} grouped values
            series={[{ key: "found", name: "Found (new)", color: "var(--brand)" }, { key: "enriched", name: "Enriched", color: "var(--sn)" }]} /></div>
        <div className="panel"><h2>Pipeline</h2><p className="sub">From found to ready to contact</p>
          <div className="funnel">{funnel.map(([l, v, c, href]) => (
            <a key={l} href={href}>
              <div className="ftop"><span>{l}</span><b className="mono">{fmt(v)}</b></div>
              <div className="fbar"><i style={{ width: Math.max(1.5, pct(v, d.total)) + "%", background: c }} /></div>
              <div className="small muted">{pct(v, d.total)}% of all candidates</div>
            </a>))}</div></div>
      </div>

      <div className="grid3 r2">
        <div className="span2"><Pools rows={d.pool_table || []} /></div>
        <div className="panel"><h2>Countries</h2><p className="sub">Where candidates are based</p>
          <div className="ctry2">{countries.map((c) => (
            <a key={c.label} href={"/candidates?country=" + encodeURIComponent(c.label)} title={c.cities.length ? "Biggest cities: " + c.cities.join(", ") : c.label}>
              <span className="cn">{c.label}</span>
              <span className="cbar"><i style={{ width: Math.max(2, pct(c.value, countries[0]?.value)) + "%" }} /></span>
              <b className="mono">{fmt(c.value)}</b><span className="mono small muted">{pct(c.value, d.total)}%</span>
            </a>))}
            {otherC > 0 && countries.length > 0 && <div className="crow-other"><span className="cn muted">Other / unknown</span><span /><b className="mono muted">{fmt(otherC)}</b><span className="mono small muted">{pct(otherC, d.total)}%</span></div>}
          </div>
          {!countries.length && <div className="empty">No countries yet</div>}</div>
      </div>

      <div className="grid2 r3">
        <div className="panel">
          <div className="phead2"><div><h2>Phone numbers found</h2><p className="sub">{fmt(ct.phones)} candidates with a phone number</p></div><a className="small" href="/candidates?has_phone=1">View all</a></div>
          <div className="fill">{ct.list.slice(0, 5).map((c) => (
            <a key={c.id} className="row" href={"/candidate/" + encodeURIComponent(c.id)}><Avatar c={c} />
              <div className="grow"><div className="t">{c.name}</div><div className="s mono phonev">{c.phone}</div></div>
              <span className="chip tiny">{c.phone_source}</span></a>
          ))}
          </div>{!ct.list.length && <div className="empty">No phone numbers yet</div>}
        </div>
        <div className="panel">
          <div className="phead2"><div><h2>Recently updated</h2><p className="sub">Latest changes by automation or by you</p></div><a className="small" href="/candidates">View all</a></div>
          <div className="fill">{d.recent.slice(0, 5).map((c) => (
            <a key={c.id} className="row" href={"/candidate/" + encodeURIComponent(c.id)}><Avatar c={c} />
              <div className="grow"><div className="t">{c.name}</div><div className="s">{when(c.updated_at)} · {c.updated_by}</div></div>
              <span className={"chip mono " + tone(c.percent)[1]}>{c.percent}%</span></a>
          ))}
          </div>{!d.recent.length && <div className="empty">No candidates yet</div>}
        </div>
      </div>
    </div>
  );
}
