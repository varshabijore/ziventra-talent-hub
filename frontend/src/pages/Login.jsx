import { useState } from "react";
import { api } from "../api.js";
import { Icon } from "../components/ui.jsx";
import { APP_NAME, APP_SHORT } from "../brand.js";

const FEATURES = [
  ["refresh", "Updated every day", "New candidates, full profiles and LinkedIn changes, automatically."],
  ["star", "Profile completeness", "See at a glance what is missing on each candidate, and why."],
  ["shield", "Private admin access", "One secure admin login for the whole candidate database."],
];

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!email.trim() || !pw) return setErr("Enter your email and password");
    setBusy(true);
    try {
      const r = await api("/auth/login", { method: "POST", body: { email: email.trim(), password: pw } });
      onLogin(r.user, r.token);
    } catch (ex) { setErr(ex.message); setBusy(false); }
  };

  return (
    <div className="auth">
      <aside className="art">
        <div className="logo"><i>{APP_SHORT}</i>{APP_NAME}</div>
        <div className="art-mid">
          <h2>ServiceNow and AI/ML talent, in one place.</h2>
          <p>Candidates found and enriched every day by our automation.</p>
          <ul className="feat">{FEATURES.map(([ic, t, d]) => <li key={t}><span><Icon name={ic} /></span><div><b>{t}</b>{d}</div></li>)}</ul>
        </div>
        <div className="small" style={{ opacity: 0.75 }}>© {new Date().getFullYear()} Ziventra · Internal use only</div>
      </aside>
      <div className="form">
        <form className="box" onSubmit={submit} noValidate>
          <div className="logo mobile-only"><i>{APP_SHORT}</i>{APP_NAME}</div>
          <div><h1>Welcome back</h1><p className="muted" style={{ margin: "4px 0 0" }}>Sign in with the admin account.</p></div>
          {err && <div className="msg err" role="alert">{err}</div>}
          <label className="f">Email<input type="email" autoComplete="username" placeholder="name@ziventra.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
          <label className="f">Password
            <span className="pw"><input type={show ? "text" : "password"} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
              <button type="button" className="eye" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>{show ? "Hide" : "Show"}</button></span></label>
          <button className="btn primary big" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          <p className="small muted" style={{ margin: 0 }}>Forgot the password? It can be reset from the server settings (see README, "Reset admin password").</p>
        </form>
      </div>
    </div>
  );
}
