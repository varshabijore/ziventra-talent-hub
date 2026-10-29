// Tiny router with clean URLs: /dashboard, /candidates?x=1, /candidate/<id>, /daily?date=
import { useEffect, useState } from "react";
import { LOGIN_PATH } from "./brand.js";

export function parse() {
  if (location.hash.startsWith("#/")) history.replaceState(null, "", location.hash.slice(1)); // old #/ links still work
  const raw = location.pathname;
  const path = decodeURIComponent(raw.replace(/^\/+/, ""));
  const query = new URLSearchParams(location.search);
  if (raw === LOGIN_PATH) return { name: "login", query };
  if (path === "login") return { name: "notfound", query }; // the old public sign-in address no longer exists
  if (path.startsWith("candidate/")) return { name: "candidate", id: path.slice(10), query };
  return { name: path || "dashboard", query };
}

export const go = (url, replace = false) => {
  if (url === location.pathname + location.search) return;
  history[replace ? "replaceState" : "pushState"](null, "", url);
  dispatchEvent(new PopStateEvent("popstate"));
};

export function useRoute() {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => { setR(parse()); scrollTo(0, 0); };
    // normal <a href="/..."> links open inside the app instead of reloading the page
    const click = (e) => {
      const a = e.target.closest("a[href]");
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || a.target || a.origin !== location.origin) return;
      e.preventDefault();
      go(a.pathname + a.search + a.hash);
    };
    addEventListener("popstate", on);
    document.addEventListener("click", click);
    setR(parse());
    return () => { removeEventListener("popstate", on); document.removeEventListener("click", click); };
  }, []);
  return r;
}
