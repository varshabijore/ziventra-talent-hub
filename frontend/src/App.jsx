import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { APP_NAME, APP_SHORT, LOGIN_PATH } from "./brand.js";
import { useRoute } from "./router.js";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { DataProvider } from "./context/DataContext.jsx";
import { Icon, Modal, ToastProvider, initials, useToast, when } from "./components/ui.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Candidates from "./pages/Candidates.jsx";
import Candidate from "./pages/Candidate.jsx";
import Daily from "./pages/Daily.jsx";

const NAV = [["dashboard", "Dashboard", "home"], ["candidates", "Candidates", "users"], ["daily", "Daily record", "cal"]];
const TITLES = { dashboard: "Dashboard", candidates: "Candidates", candidate: "Candidate", daily: "Daily record", login: "Sign in" };

function currentTheme() {
  return document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

function useOutside(open, close, ref) {
  useEffect(() => {
    if (!open) return;
    const out = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    const esc = (e) => e.key === "Escape" && close();
    document.addEventListener("mousedown", out); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc); };
  }, [open, close, ref]);
}

// ---------- admin profile (name, account info, password) ----------
function ProfileModal({ onClose }) {
  const toast = useToast();
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [pw, setPw] = useState({ cur: "", a: "", b: "" });
  const [err, setErr] = useState({});

  const saveName = async (e) => {
    e.preventDefault();
    if (name.trim().length < 2) return setErr({ name: "Name must be at least 2 characters" });
    try { const r = await api("/auth/me", { method: "PATCH", body: { name: name.trim() } }); updateUser(r.user); setErr({}); toast("Name saved"); }
    catch (ex) { setErr({ name: ex.message }); }
  };
  const savePw = async (e) => {
    e.preventDefault();
    if (pw.a.length < 8) return setErr({ pw: "New password must be at least 8 characters" });
    if (pw.a !== pw.b) return setErr({ pw: "New passwords don't match" });
    try { await api("/auth/password", { method: "POST", body: { current: pw.cur, new: pw.a } }); setPw({ cur: "", a: "", b: "" }); setErr({}); toast("Password changed"); }
    catch (ex) { setErr({ pw: ex.message }); }
  };

  return (
    <Modal onClose={onClose}>
      <div className="phero">
        <span className="av c-brand big">{initials(user.name)}</span>
        <div><h2 style={{ margin: 0 }}>{user.name}</h2><div className="muted small">{user.email}</div>
          <div className="chips" style={{ marginTop: 6 }}><span className="chip c-brand">Admin</span><span className="chip c-good">Active</span></div></div>
        <button className="iconx" type="button" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="pinfo">
        <div><span>Last sign-in</span><b>{when(user.last_login)}</b></div>
        <div><span>Account created</span><b>{when(user.created_at)}</b></div>
      </div>
      <form className="psec" onSubmit={saveName}>
        <h3>Profile</h3>
        {err.name && <div className="msg err">{err.name}</div>}
        <div className="row2">
          <label className="f">Full name<input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
          <label className="f">Email<input type="text" value={user.email} disabled /></label>
        </div>
        <div className="actions"><button className="btn primary sm" type="submit" disabled={name.trim() === user.name}>Save name</button></div>
      </form>
      <form className="psec" onSubmit={savePw}>
        <h3>Change password</h3>
        {err.pw && <div className="msg err">{err.pw}</div>}
        <label className="f">Current password<input type="password" autoComplete="current-password" value={pw.cur} onChange={(e) => setPw({ ...pw, cur: e.target.value })} required /></label>
        <div className="row2">
          <label className="f">New password<input type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} required /></label>
          <label className="f">Confirm new password<input type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} required /></label>
        </div>
        <div className="actions"><button className="btn primary sm" type="submit">Change password</button></div>
      </form>
    </Modal>
  );
}

function UserMenu({ theme, onTheme, onProfile }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutside(open, () => setOpen(false), ref);
  const pick = (fn) => () => { setOpen(false); fn(); };
  return (
    <div className="umenu" ref={ref}>
      <button type="button" className="avbtn" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" title={user.name}>{initials(user.name)}</button>
      {open && <div className="udrop" role="menu">
        <div className="uhead"><span className="av c-brand">{initials(user.name)}</span><div><b>{user.name}</b><span>{user.email}</span></div></div>
        <button type="button" role="menuitem" onClick={pick(onProfile)}><Icon name="users" /> My profile</button>
        <button type="button" role="menuitem" onClick={() => onTheme()}><Icon name={theme === "dark" ? "sun" : "moon"} /> {theme === "dark" ? "Light mode" : "Dark mode"}</button>
        <div className="sep" />
        <button type="button" role="menuitem" onClick={pick(logout)}><Icon name="out" /> Sign out</button>
      </div>}
    </div>
  );
}

function Shell({ route, children }) {
  const [theme, setTheme] = useState(currentTheme);
  const [profile, setProfile] = useState(false);
  const [closed, setClosed] = useState(false); // panel is open by default on every visit
  const [mobileOpen, setMobileOpen] = useState(false);
  const mref = useRef(null);
  useOutside(mobileOpen, () => setMobileOpen(false), mref);
  useEffect(() => setMobileOpen(false), [route]);
  const active = route.name === "candidate" ? "candidates" : route.name;
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch { /* ignore */ }
    setTheme(next);
  };
  const menu = { theme, onTheme: toggleTheme, onProfile: () => setProfile(true) };
  const links = NAV.map(([id, label, icon]) => (
    <a key={id} className="nav" href={"/" + id} title={label} aria-label={label} aria-current={active === id ? "page" : undefined}>
      <Icon name={icon} /><span className="lbl">{label}</span></a>
  ));

  return (
    <div className={"shell" + (closed ? " closed" : "")}>
      {/* laptop / desktop: side panel */}
      <nav className="side" aria-label="Main">
        <div className="sidehead">
          <a className="brand" href="/dashboard" title={APP_NAME}><i>{APP_SHORT}</i><span>{APP_NAME}</span></a>
          <button type="button" className="sidetoggle" onClick={() => setClosed(!closed)} aria-expanded={!closed}
            aria-label={closed ? "Expand sidebar" : "Collapse sidebar"} title={closed ? "Expand sidebar" : "Collapse sidebar"}><Icon name="panel" /></button>
        </div>
        <div className="sidelinks">{links}</div>
      </nav>
      {/* phone / small tablet: top header with logo + menu button */}
      <header className="mhead" ref={mref}>
        <a className="logo" href="/dashboard"><i>{APP_SHORT}</i><span>{APP_NAME}</span></a>
        <div className="mright">
          <UserMenu {...menu} />
          <button type="button" className="iconbtn" onClick={() => setMobileOpen(!mobileOpen)} aria-expanded={mobileOpen} aria-label="Menu"><Icon name={mobileOpen ? "x" : "menu"} /></button>
        </div>
        {mobileOpen && <nav className="mnav" aria-label="Main">{links}</nav>}
      </header>
      <main>
        <div className="deskmenu"><UserMenu {...menu} /></div>
        {children}
      </main>
      {profile && <ProfileModal onClose={() => setProfile(false)} />}
    </div>
  );
}

function NotFound({ signedIn }) {
  return (
    <div className="nf"><div className="nfbox">
      <div className="nfcode">404</div><h1>Page not found</h1>
      <p className="muted">The page you are looking for does not exist.</p>
      {signedIn && <a className="btn primary" href="/dashboard">Go to dashboard</a>}
    </div></div>
  );
}

function Routes() {
  const route = useRoute();
  const { user, login } = useAuth();
  useEffect(() => { document.title = (TITLES[route.name] ? TITLES[route.name] + " · " : "") + APP_NAME; }, [route.name]);

  if (!user) return route.name === "login" ? <Login onLogin={login} /> : <NotFound />;
  if (route.name === "login") { setTimeout(() => history.replaceState(null, "", "/dashboard") || dispatchEvent(new PopStateEvent("popstate"))); return null; }
  const page = {
    dashboard: <Dashboard user={user} />,
    candidates: <Candidates query={route.query} />,
    candidate: <Candidate id={route.id} query={route.query} />,
    daily: <Daily query={route.query} />,
  }[route.name];
  return <Shell route={route}>{page || <NotFound signedIn />}</Shell>;
}

export default function App() {
  return <ToastProvider><DataProvider><AuthProvider><Routes /></AuthProvider></DataProvider></ToastProvider>;
}

export { LOGIN_PATH };
