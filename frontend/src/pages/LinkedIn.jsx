// LinkedIn accounts (TRIAL): connect an account with its li_at cookie, run a LinkedIn people search through Apify,
// and the people found go straight into a pool. The cookie is stored encrypted and is never shown again.
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useCached, useData } from "../context/DataContext.jsx";
import { ErrorBox, Icon, Loading, Modal, fmt, useToast } from "../components/ui.jsx";

const STATUS = { running: ["c-warn", "Running…"], done: ["c-good", "Done"], failed: ["c-bad", "Failed"] };

function Connect({ onClose, onDone }) {
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [cookie, setCookie] = useState("");
  const [limit, setLimit] = useState(100);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      await api("/linkedin/accounts", { method: "POST", body: { label, cookie, daily_limit: limit, user_agent: navigator.userAgent } });
      toast(`“${label}” connected`); onDone(); onClose();
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };
  return (
    <Modal onClose={() => !busy && onClose()}>
      <h2>Connect a LinkedIn account</h2>
      <ol className="listeps">
        <li>Log in to the LinkedIn account in <b>this browser</b> (Chrome).</li>
        <li>Press <b>F12</b> → <b>Application</b> → <b>Cookies</b> → <b>https://www.linkedin.com</b>.</li>
        <li>Find <b>li_at</b> and copy its <b>Value</b> (long text). Paste it below.</li>
      </ol>
      <form onSubmit={save} className="aoform">
        <label className="f"><span>Account name</span><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Test account 1" maxLength={40} autoFocus required /></label>
        <label className="f"><span>li_at cookie value</span>
          <input type="password" value={cookie} onChange={(e) => setCookie(e.target.value)} placeholder="AQEDA…" autoComplete="off" required />
          <em className="muted small">Saved encrypted. It is never shown again; “Disconnect” deletes it.</em></label>
        <label className="f"><span>People per day (safe limit)</span>
          <input type="number" min={10} max={200} value={limit} onChange={(e) => setLimit(e.target.value)} />
          <em className="muted small">Guide: 50–100 per run, 1–2 runs a day. A new account should stay low.</em></label>
        {err && <div className="msg err">{err}</div>}
        <div className="actions"><button className="btn" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" type="submit" disabled={busy || !label.trim() || cookie.trim().length < 20}><Icon name="link" /> {busy ? "Connecting…" : "Connect"}</button></div>
      </form>
    </Modal>
  );
}

export default function LinkedIn() {
  const toast = useToast();
  const data = useData();
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const { data: d, error, loading, reload } = useCached("/linkedin", { keep: true });
  const [connect, setConnect] = useState(false);
  const [acc, setAcc] = useState("");
  const [pool, setPool] = useState("");
  const [url, setUrl] = useState("");
  const [count, setCount] = useState(50);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const running = (d?.runs || []).some((r) => r.status === "running");
  // while a search runs, check every 15 s (the page imports the people as soon as Apify finishes)
  useEffect(() => { if (!running) return; const t = setInterval(() => { data.invalidate("/linkedin"); reload(); }, 15000); return () => clearInterval(t); }, [running]); // eslint-disable-line
  useEffect(() => { if (d?.accounts?.length && !acc) setAcc(d.accounts[0].id); }, [d]); // eslint-disable-line

  if (loading && !d) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const refresh = () => { data.invalidate("/linkedin", "/candidates?", "/dashboard"); reload(); };
  const cur = d.accounts.find((a) => a.id === acc);
  const left = cur ? Math.max(0, cur.daily_limit - cur.used_today) : 0;

  const start = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await api("/linkedin/runs", { method: "POST", body: { account_id: acc, pool, search_url: url, count } });
      toast(`Search started: up to ${r.run.count} people into ${pool}`); setUrl(""); refresh();
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };
  const disconnect = async (a) => {
    if (!window.confirm(`Disconnect “${a.label}”? Its cookie is deleted.`)) return;
    try { await api("/linkedin/accounts/" + a.id, { method: "DELETE" }); toast(`“${a.label}” disconnected`); refresh(); } catch (ex) { toast(ex.message); }
  };

  return (
    <>
      <div className="top"><div><h1>LinkedIn accounts</h1>
        <p>Trial · connect an account, run a LinkedIn people search, the people go straight into a pool</p></div>
        {admin && <button className="btn primary" type="button" onClick={() => setConnect(true)}><Icon name="link" /> Connect account</button>}</div>
      {!d.apify_ready && <div className="jwarn" style={{ marginBottom: 12 }}>⚠ The server has no Apify token yet. Add <b>APIFY_TOKEN</b> in Render → Environment, then searches can run.</div>}
      {d.demo && <div className="mbox" style={{ marginBottom: 12 }}>Demo mode: searches return sample people, nothing is sent to Apify.</div>}

      <div className="grid3 liwrap">
        <section className="panel">
          <h2>Accounts</h2><p className="sub">{d.accounts.length ? `${d.accounts.length} connected` : "No account connected yet"}</p>
          <div className="liacc">{d.accounts.map((a) => (
            <div key={a.id} className={"liacc1" + (a.id === acc ? " on" : "")} onClick={() => setAcc(a.id)}>
              <div className="lihead"><b>{a.label}</b><span className={"chip tiny " + (a.status === "connected" ? "c-good" : "c-warn")}>{a.status}</span></div>
              <div className="small muted mono">cookie {a.hint} · by {a.connected_by}</div>
              <div className="fbar" title={`${a.used_today} of ${a.daily_limit} people today`}><i style={{ width: Math.min(100, (100 * a.used_today) / a.daily_limit) + "%", background: "var(--brand)" }} /></div>
              <div className="small muted">{a.used_today} / {a.daily_limit} people today · {fmt(a.added_total)} added so far</div>
              {admin && <button type="button" className="linkbtn" onClick={(e) => { e.stopPropagation(); disconnect(a); }}>Disconnect</button>}
            </div>))}
            {!d.accounts.length && <div className="empty small">{admin ? "Click “Connect account” to add the test account." : "An admin has to connect an account first."}</div>}
          </div>
          <div className="mbox small" style={{ marginTop: 12 }}>
            <b>Keep the account alive</b>: 50–100 people per run, 1–2 runs a day, use the 2nd-degree filter. If a run returns 0 people, the cookie was logged out: disconnect and connect a fresh li_at.
          </div>
        </section>

        <section className="panel span2">
          <h2>Run a search</h2><p className="sub">Search on LinkedIn (in the connected account) → click <b>People</b> → add filters (location, current company, 2nd degree) → copy the address bar</p>
          <form onSubmit={start} className="aoform">
            <div className="lirow">
              <label className="f"><span>Account</span><select value={acc} onChange={(e) => setAcc(e.target.value)} required>
                <option value="">Choose…</option>{d.accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
              <label className="f"><span>Pool for these people</span><select value={pool} onChange={(e) => setPool(e.target.value)} required>
                <option value="">Choose a pool…</option>{d.pools.map((p) => <option key={p}>{p}</option>)}</select></label>
              <label className="f"><span>People ({cur ? `${left} left today` : `max ${d.max_per_run}`})</span>
                <input type="number" min={10} max={d.max_per_run} value={count} onChange={(e) => setCount(e.target.value)} /></label>
            </div>
            <label className="f"><span>LinkedIn people search URL</span>
              <textarea rows={2} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.linkedin.com/search/results/people/?keywords=actimize&geoUrn=…" required /></label>
            {cur && left === 0 && <div className="msg err">Daily limit reached for {cur.label}. Try tomorrow.</div>}
            {err && <div className="msg err">{err}</div>}
            <div className="actions"><button className="btn primary" type="submit" disabled={busy || !acc || !pool || !url.trim() || !d.apify_ready || (cur && left === 0)}>
              <Icon name="search" /> {busy ? "Starting…" : "Start search"}</button></div>
          </form>

          <h2 style={{ marginTop: 18 }}>Searches</h2><p className="sub">{running ? "A search is running; this list updates every 15 seconds" : "Newest first"}</p>
          <div className="tbl"><table><thead><tr><th>Started</th><th>Account → pool</th><th>Status</th><th className="num">Found</th><th className="num">Added</th><th className="num" title="Already in Talent Hub / hidden names (LinkedIn Member)">Had / hidden</th></tr></thead>
            <tbody>{d.runs.map((r) => {
              const [cls, label] = STATUS[r.status] || STATUS.done;
              return (<tr key={r.id}>
                <td className="mono small nowrap">{r.started_at.slice(5)}<div className="muted">{r.by}</div></td>
                <td><b>{r.account}</b> → <a href={"/candidates?pool=" + encodeURIComponent(r.pool)}>{r.pool}</a>
                  <div className="small muted litrim" title={r.search_url}>{r.search_url}</div>{r.message && <div className="small iss">⚠ {r.message}</div>}</td>
                <td><span className={"chip " + cls}>{label}</span></td>
                <td className="num mono">{r.status === "running" ? "…" : fmt(r.found)}</td><td className="num mono"><b>{r.status === "running" ? "…" : fmt(r.added)}</b></td>
                <td className="num mono">{r.status === "running" ? "…" : `${fmt(r.existing)} / ${fmt(r.hidden)}`}</td>
              </tr>);
            })}</tbody></table>
            {!d.runs.length && <div className="empty small">No searches yet.</div>}</div>
        </section>
      </div>
      {connect && <Connect onClose={() => setConnect(false)} onDone={refresh} />}
    </>
  );
}
