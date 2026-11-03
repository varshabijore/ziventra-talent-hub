// All talent pools in one place (chip colour, chart colour, short description).
export const POOLS = [
  { name: "ServiceNow", cls: "c-sn", color: "var(--sn)", desc: "Developers, admins, architects, consultants" },
  { name: "AI/ML", cls: "c-ai", color: "var(--ai)", desc: "ML, GenAI / LLM, data science, MLOps" },
  { name: "Salesforce", cls: "c-sf", color: "var(--sf)", desc: "Developers, admins, architects, CPQ / Marketing Cloud" },
  { name: "Workday", cls: "c-wd", color: "var(--wd)", desc: "HCM, integrations, financials, payroll consultants" },
];
export const POOL_NAMES = POOLS.map((p) => p.name);
export const poolCls = (name) => (POOLS.find((p) => p.name === name) || POOLS[1]).cls;
