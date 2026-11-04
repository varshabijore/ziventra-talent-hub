// All talent pools in one place (chip colour, chart colour, short description).
import { useCached } from "./context/DataContext.jsx";

export const POOLS = [
  { name: "ServiceNow", cls: "c-sn", color: "var(--sn)", desc: "Developers, admins, architects, consultants" },
  { name: "AI/ML", cls: "c-ai", color: "var(--ai)", desc: "ML, GenAI / LLM, data science, MLOps" },
  { name: "Salesforce", cls: "c-sf", color: "var(--sf)", desc: "Developers, admins, architects, CPQ / Marketing Cloud" },
  { name: "Workday", cls: "c-wd", color: "var(--wd)", desc: "HCM, integrations, financials, payroll consultants" },
];
export const POOL_NAMES = POOLS.map((p) => p.name);
const EXTRA_COLORS = ["var(--brand)", "#0E9F9A", "#C2410C", "#7C3AED", "#BE185D", "#4D7C0F"];
export const poolCls = (name) => (POOLS.find((p) => p.name === name) || { cls: "c-cx" }).cls;
export const poolColor = (name, i = 0) => (POOLS.find((p) => p.name === name) || { color: EXTRA_COLORS[i % EXTRA_COLORS.length] }).color;

// built-in pools + the ones added on the website ("+ Add option" on the Candidates filters)
export function useAllPools() {
  const { data } = useCached("/options");
  const extra = (data?.pools || []).map((p, i) => ({ name: p.name, cls: "c-cx", color: EXTRA_COLORS[i % EXTRA_COLORS.length], desc: p.desc || "Added on the website", custom: true }));
  return { pools: [...POOLS, ...extra], roles: (data?.roles || []).map((r) => (typeof r === "string" ? r : r.name)) };
}
