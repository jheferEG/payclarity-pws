import type {
  Agent,
  FinanceCompany,
  Invoice,
  OverrideLevel,
  PersonalTier,
} from "./commission-store";

export const fmtMoney = (n: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(n || 0);

export type InvoiceCalc = {
  invoice: Invoice;
  financeCo: FinanceCompany | null;
  approvalAmount: number;
  totalCharges: number;
  totalCredits: number;
  grandTotal: number;        // approval - charges + credits - discount
  profit: number;            // grandTotal - productCost
  commissionableBase: number; // base used for commission % (profit or productCost)
};

export function calcInvoice(
  inv: Invoice,
  financeCompanies: FinanceCompany[]
): InvoiceCalc {
  const fc = financeCompanies.find((f) => f.id === inv.financeCompanyId) || null;
  const approvalAmount = inv.salesAmount * (inv.approvalPercent || 0);
  const dealerFee = inv.dealerFee != null ? inv.dealerFee : fc ? fc.dealerFee : 0;
  const ccpf =
    inv.saleType === "credit_card"
      ? inv.salesAmount * (inv.ccpfPercent ?? 0.035)
      : 0;
  const adminFeePct = inv.salesAmount * (inv.adminFeePercent || 0);
  const totalCharges =
    (inv.charges || []).reduce((s, c) => s + Number(c.amount || 0), 0) +
    (fc ? fc.adminFee + fc.defaultFee * inv.salesAmount : 0) +
    dealerFee +
    ccpf +
    adminFeePct;
  const totalCredits = (inv.credits || []).reduce(
    (s, c) => s + Number(c.amount || 0),
    0
  );
  const grandTotal =
    approvalAmount - inv.discount - totalCharges + totalCredits;
  const profit = grandTotal - (inv.productCost || 0);
  const commissionableBase =
    inv.commissionBase === "product_cost" ? (inv.productCost || 0) : profit;
  return {
    invoice: inv,
    financeCo: fc,
    approvalAmount,
    totalCharges,
    totalCredits,
    grandTotal,
    profit,
    commissionableBase,
  };
}

export function rateForVolume(tiers: PersonalTier[], volume: number): number {
  const sorted = [...tiers].sort((a, b) => a.minVolume - b.minVolume);
  let rate = 0;
  for (const t of sorted) if (volume >= t.minVolume) rate = t.rate;
  return rate;
}

export type DownlineEntry = {
  agent: Agent;
  level: number;
  profit: number;
  rate: number;
  override: number;
};

export type AgentPayout = {
  agent: Agent;
  invoices: InvoiceCalc[];
  personalProfit: number;     // commission base
  personalRate: number;
  personalCommission: number;
  downline: DownlineEntry[];
  overrideTotal: number;
  grossPayout: number;
  advanceApplied: number;
  specialDeductions: number;
  netPayable: number;
  taxReserveSuggested: number;
  finalPayable: number;
  pendingBalance: number;
};

function buildChildren(agents: Agent[]): Map<string | null, Agent[]> {
  const m = new Map<string | null, Agent[]>();
  for (const a of agents) {
    const key = a.sponsorId ?? null;
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(a);
  }
  return m;
}

function collectDownline(
  rootId: string,
  children: Map<string | null, Agent[]>
): { agent: Agent; level: number }[] {
  const out: { agent: Agent; level: number }[] = [];
  const visited = new Set<string>();
  const walk = (id: string, level: number) => {
    if (visited.has(id)) return;
    visited.add(id);
    for (const k of children.get(id) || []) {
      out.push({ agent: k, level });
      walk(k.id, level + 1);
    }
  };
  walk(rootId, 1);
  return out;
}

export function calcPayouts(
  agents: Agent[],
  invoices: Invoice[],
  financeCompanies: FinanceCompany[],
  tiers: PersonalTier[],
  overrides: OverrideLevel[]
): AgentPayout[] {
  const calced = invoices.map((i) => calcInvoice(i, financeCompanies));
  const profitByAgent = new Map<string, number>();
  const baseByAgent = new Map<string, number>();
  const advanceByAgent = new Map<string, number>();
  const specialByAgent = new Map<string, number>();
  const reservePctByAgent = new Map<string, number>();
  const paidStatus = new Map<string, boolean>();
  const invoicesByAgent = new Map<string, InvoiceCalc[]>();

  for (const c of calced) {
    const a = c.invoice.agentId;
    profitByAgent.set(a, (profitByAgent.get(a) || 0) + c.profit);
    baseByAgent.set(a, (baseByAgent.get(a) || 0) + c.commissionableBase);
    advanceByAgent.set(a, (advanceByAgent.get(a) || 0) + (c.invoice.advanceApplied || 0));
    specialByAgent.set(a, (specialByAgent.get(a) || 0) + (c.invoice.specialDeductions || 0));
    // last reserve % wins (simple MVP)
    if (c.invoice.taxReservePercent) reservePctByAgent.set(a, c.invoice.taxReservePercent);
    if (!invoicesByAgent.has(a)) invoicesByAgent.set(a, []);
    invoicesByAgent.get(a)!.push(c);
    paidStatus.set(a, (paidStatus.get(a) ?? true) && c.invoice.paid);
  }

  const overrideMap = new Map(overrides.map((o) => [o.level, o.rate]));
  const children = buildChildren(agents);

  return agents.map((a) => {
    const personalProfit = profitByAgent.get(a.id) || 0;
    const personalBase = baseByAgent.get(a.id) || 0;
    // Default rate: salesperson's own Commission % when set; otherwise volume tier.
    const personalRate =
      a.commissionPercent != null ? a.commissionPercent : rateForVolume(tiers, personalProfit);
    const usesFixedPayout = a.commissionMode === "fixed" && a.fixedCommissionAmount != null;
    // Sum commission per-invoice so admin per-invoice overrides apply.
    const myInvoices = invoicesByAgent.get(a.id) || [];
    const personalCommission = myInvoices.reduce((sum, c) => {
      if (c.invoice.commissionPercentOverride != null) {
        return sum + Math.max(0, c.commissionableBase) * c.invoice.commissionPercentOverride;
      }
      if (usesFixedPayout) return sum + (a.fixedCommissionAmount || 0);
      return sum + Math.max(0, c.commissionableBase) * personalRate;
    }, 0);
    // When paid a flat amount, report the effective rate (for display only —
    // e.g. "@ X%" in PDFs/tables) rather than the unused percent/tier rate.
    const personalRateForDisplay = usesFixedPayout
      ? (personalBase > 0 ? personalCommission / personalBase : 0)
      : personalRate;

    const dl = collectDownline(a.id, children);
    const downline: DownlineEntry[] = dl.map(({ agent, level }) => {
      const profit = Math.max(0, profitByAgent.get(agent.id) || 0);
      const rate = overrideMap.get(level) || 0;
      return { agent, level, profit, rate, override: profit * rate };
    });
    const overrideTotal = downline.reduce((s, d) => s + d.override, 0);

    const grossPayout = personalCommission + overrideTotal;
    const advanceApplied = advanceByAgent.get(a.id) || 0;
    const specialDeductions = specialByAgent.get(a.id) || 0;
    const netPayable = grossPayout - advanceApplied - specialDeductions;
    const reservePct = reservePctByAgent.get(a.id) || 0;
    const taxReserveSuggested = Math.max(0, netPayable) * reservePct;
    const finalPayable = netPayable - taxReserveSuggested;
    const allPaid = paidStatus.get(a.id) ?? true;
    const pendingBalance = allPaid ? 0 : Math.max(0, netPayable);

    return {
      agent: a,
      invoices: invoicesByAgent.get(a.id) || [],
      personalProfit,
      personalRate: personalRateForDisplay,
      personalCommission,
      downline,
      overrideTotal,
      grossPayout,
      advanceApplied,
      specialDeductions,
      netPayable,
      taxReserveSuggested,
      finalPayable,
      pendingBalance,
    };
  });
}

/* ---------- Validation ---------- */

export function validateTiers(tiers: PersonalTier[]): string[] {
  const errs: string[] = [];
  if (!tiers.length) errs.push("At least one tier is required.");
  const sorted = [...tiers].sort((a, b) => a.minVolume - b.minVolume);
  if (sorted[0] && sorted[0].minVolume !== 0)
    errs.push("First tier must start at min volume 0.");
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (t.minVolume < 0) errs.push(`Tier ${i + 1}: min volume cannot be negative.`);
    if (t.rate < 0 || t.rate > 1)
      errs.push(`Tier ${i + 1}: rate must be between 0% and 100%.`);
    if (i > 0 && t.minVolume === sorted[i - 1].minVolume)
      errs.push(`Duplicate min volume at tier ${i + 1}.`);
  }
  return errs;
}

export function validateOverrides(overrides: OverrideLevel[]): string[] {
  const errs: string[] = [];
  const seen = new Set<number>();
  for (const o of overrides) {
    if (o.level < 1) errs.push(`Override level must be >= 1.`);
    if (seen.has(o.level)) errs.push(`Duplicate override level L${o.level}.`);
    seen.add(o.level);
    if (o.rate < 0 || o.rate > 1)
      errs.push(`Level ${o.level}: rate must be between 0% and 100%.`);
  }
  return errs;
}
