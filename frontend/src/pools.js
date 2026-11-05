// All talent pools in one place (chip colour, chart colour, short description).
import { useCached } from "./context/DataContext.jsx";

export const POOLS = [
  { name: "ServiceNow", cls: "c-sn", color: "var(--sn)", desc: "Developers, admins, architects, consultants" },
  { name: "AI/ML", cls: "c-ai", color: "var(--ai)", desc: "ML, GenAI / LLM, data science, MLOps" },
  { name: "Salesforce", cls: "c-sf", color: "var(--sf)", desc: "Developers, admins, architects, CPQ / Marketing Cloud" },
  { name: "Workday", cls: "c-wd", color: "var(--wd)", desc: "HCM, integrations, financials, payroll consultants" },
];
export const POOL_NAMES = POOLS.map((p) => p.name);
// clearly different from the built-in pool colours (ServiceNow green, AI/ML purple, Salesforce blue, Workday orange)
const EXTRA_COLORS = ["#0EA5E9", "#BE185D", "#CA8A04", "#0E9F9A", "#4D7C0F", "#9F1239"];
export const OTHER_COLOR = "#94A3B8";
// Many pools (30+) break charts and legends. Keep the 4 built-in pools + the biggest added ones,
// and fold the rest into one "N more pools" entry. counts: {pool: number}
export function topPools(counts, max = 7) {
  const built = POOLS.filter((p) => (counts[p.name] || 0) > 0 || ["ServiceNow", "AI/ML"].includes(p.name)).map((p) => ({ name: p.name, color: p.color, value: counts[p.name] || 0 }));
  const extra = Object.entries(counts).filter(([n, v]) => v > 0 && !POOL_NAMES.includes(n)).sort((a, b) => b[1] - a[1]);
  const room = Math.max(1, max - built.length);
  const keep = extra.length <= room + 1 ? extra : extra.slice(0, room);
  const rest = extra.slice(keep.length);
  const shown = [...built, ...keep.map(([n, v], i) => ({ name: n, color: EXTRA_COLORS[i % EXTRA_COLORS.length], value: v }))];
  if (rest.length) shown.push({ name: `${rest.length} more pools`, color: OTHER_COLOR, value: rest.reduce((a, [, v]) => a + v, 0), other: rest.map(([n]) => n) });
  return { shown, all: [...built.map((p) => [p.name, p.value]), ...extra], count: built.length + extra.length };
}
export const poolCls = (name) => (POOLS.find((p) => p.name === name) || { cls: "c-cx" }).cls;
export const poolColor = (name, i = 0) => (POOLS.find((p) => p.name === name) || { color: EXTRA_COLORS[i % EXTRA_COLORS.length] }).color;

// built-in pools + the ones added on the website ("+ Add option" on the Candidates filters)
export function useAllPools() {
  const { data } = useCached("/options");
  const extra = (data?.pools || []).map((p, i) => ({ name: p.name, cls: "c-cx", color: EXTRA_COLORS[i % EXTRA_COLORS.length], desc: p.desc || "Added on the website", custom: true }));
  return { pools: [...POOLS, ...extra], roles: (data?.roles || []).map((r) => (typeof r === "string" ? r : r.name)) };
}
