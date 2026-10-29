// Signed-in admin, shared with every page through React Context.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, session, setOnExpired } from "../api.js";
import { go } from "../router.js";
import { LOGIN_PATH } from "../brand.js";
import { useData } from "./DataContext.jsx";

const Ctx = createContext(null);
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

export function AuthProvider({ children }) {
  const data = useData();
  const [user, setUser] = useState(() => session.get()?.user || null);

  const warmUp = useCallback(() => data.prefetch(["/dashboard", "/daily?date=" + today(), "/candidates?sort=updated&dir=desc&page=1&size=12"]), [data]);

  useEffect(() => {
    setOnExpired(() => { data.clear(); setUser(null); go(LOGIN_PATH, true); });
    if (!user) return;
    warmUp();
    api("/auth/me").then((r) => { setUser(r.user); session.set({ ...session.get(), user: r.user }); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({
    user,
    login: (u, token) => { session.set({ user: u, token }); setUser(u); warmUp(); go("/dashboard", true); },
    logout: async () => { try { await api("/auth/logout", { method: "POST" }); } catch { /* ignore */ } session.clear(); data.clear(); setUser(null); go(LOGIN_PATH, true); },
    updateUser: (u) => { setUser(u); session.set({ ...session.get(), user: u }); },
  }), [user, data, warmUp]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
