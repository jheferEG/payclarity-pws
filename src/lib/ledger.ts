import type {
  Adjustment,
  Agent,
  Company,
  Dispute,
  Invoice,
  InvoiceSplit,
  Payment,
  SplitParticipant,
} from "./commission-store";
import { calcInvoice, calcPayouts, fmtMoney, type AgentPayout, type InvoiceCalc } from "./commission-calc";
import type { FinanceCompany, OverrideLevel, PersonalTier } from "./commission-store";
import type { Lang } from "./i18n";

/** Returns the share of the personal commission allocated to a given agent
 *  according to the invoice's split, or null if there is no usable split. */
export function shareForAgent(
  inv: Invoice,
  c: InvoiceCalc,
  agentRate: number,
  agentId: string
): { share: number; participant: SplitParticipant } | null {
  const split: InvoiceSplit | null | undefined = inv.split;
  if (!split || split.participants.length === 0) return null;
  const total = split.participants.reduce((s, p) => s + (p.splitPercent || 0), 0);
  if (Math.abs(total - 1) > 0.0001) return null; // invalid splits ignored
  const part = split.participants.find((p) => p.agentId === agentId);
  if (!part) return null;
  const rate = inv.commissionPercentOverride ?? agentRate;
  const pool = Math.max(0, Math.max(0, c.commissionableBase) * rate - c.adminFeeAmount);
  return { share: pool * part.splitPercent, participant: part };
}

export type LedgerEntry = {
  date: string;
  type:
    | "commission"
    | "override"
    | "advance"
    | "deduction"
    | "credit"
    | "chargeback"
    | "manual_override"
    | "payment_correction"
    | "split_correction"
    | "pending_balance"
    | "tax_reserve"
    | "payment"
    | "correction";
  description: string;
  debit: number; // money owed to agent
  credit: number; // money paid out / withheld
  balance: number;
  refId?: string;
  refLabel?: string;
};

export type AgentWallet = {
  agent: Agent;
  payout: AgentPayout;
  payments: Payment[];
  totalPaid: number;
  totalEarned: number;
  pendingBalance: number;
  openAdvance: number;
  taxReserve: number;
  ledger: LedgerEntry[];
};

export function buildWallet(
  agent: Agent,
  payout: AgentPayout,
  payments: Payment[],
  disputes: Dispute[],
  adjustments: Adjustment[] = [],
  allInvoices?: Invoice[],
  allFinanceCompanies?: FinanceCompany[]
): AgentWallet {
  const agentPayments = payments.filter((p) => p.agentId === agent.id);
  // A "scheduled" payment is a promise, not money sent yet — don't count it
  // as paid until it's actually disbursed.
  const totalPaid = agentPayments
    .filter((p) => p.status !== "scheduled")
    .reduce((s, p) => s + p.amount, 0);

  const entries: Omit<LedgerEntry, "balance">[] = [];

  for (const c of payout.invoices) {
    const fullCommission = Math.max(
      0,
      Math.max(0, c.commissionableBase) * (c.invoice.commissionPercentOverride ?? payout.personalRate) - c.adminFeeAmount
    );
    const split = c.invoice.split;
    let myShare = fullCommission;
    let splitNote = "";
    if (split && split.participants.length > 0) {
      const total = split.participants.reduce((s, p) => s + (p.splitPercent || 0), 0);
      if (Math.abs(total - 1) < 0.0001) {
        const part = split.participants.find((p) => p.agentId === agent.id);
        myShare = part ? fullCommission * part.splitPercent : 0;
        splitNote = part
          ? ` · split ${(part.splitPercent * 100).toFixed(1)}%`
          : " · no share (split)";
      }
    }
    if (myShare > 0 || !split) {
      entries.push({
        date: c.invoice.date,
        type: "commission",
        description: `Commission on sale ${c.invoice.customerName || c.invoice.number}${splitNote}`,
        debit: myShare,
        credit: 0,
        refId: c.invoice.id,
        refLabel: c.invoice.number,
      });
    }
    if (c.invoice.advanceApplied) {
      entries.push({
        date: c.invoice.date,
        type: "advance",
        description: `Advance applied on ${c.invoice.number}`,
        debit: 0,
        credit: c.invoice.advanceApplied,
        refId: c.invoice.id,
        refLabel: c.invoice.number,
      });
    }
    if (c.invoice.specialDeductions) {
      entries.push({
        date: c.invoice.date,
        type: "deduction",
        description: `Deduction on ${c.invoice.number}`,
        debit: 0,
        credit: c.invoice.specialDeductions,
        refId: c.invoice.id,
        refLabel: c.invoice.number,
      });
    }
  }

  // Split-share entries for invoices where this agent is a non-primary participant.
  if (allInvoices && allFinanceCompanies) {
    const ownIds = new Set(payout.invoices.map((c) => c.invoice.id));
    for (const inv of allInvoices) {
      if (ownIds.has(inv.id)) continue;
      const split = inv.split;
      if (!split || split.participants.length === 0) continue;
      const total = split.participants.reduce((s, p) => s + (p.splitPercent || 0), 0);
      if (Math.abs(total - 1) > 0.0001) continue;
      const part = split.participants.find((p) => p.agentId === agent.id);
      if (!part) continue;
      const c = calcInvoice(inv, allFinanceCompanies);
      // use rate of primary rep (override > rate > 0); we don't know rate so use override or 0 fallback
      const rate = inv.commissionPercentOverride ?? agent.commissionPercent ?? 0;
      const fullCommission = Math.max(0, c.commissionableBase) * rate;
      const myShare = fullCommission * part.splitPercent;
      if (myShare > 0) {
        entries.push({
          date: inv.date,
          type: "commission",
          description: `Split share on ${inv.customerName || inv.number} · ${(part.splitPercent * 100).toFixed(1)}%`,
          debit: myShare,
          credit: 0,
          refId: inv.id,
          refLabel: inv.number,
        });
      }
    }
  }

  for (const d of payout.downline) {
    entries.push({
      date: payout.invoices[payout.invoices.length - 1]?.invoice.date || new Date().toISOString().slice(0, 10),
      type: "override",
      description: `L${d.level} override on ${d.agent.name}`,
      debit: d.override,
      credit: 0,
      refLabel: d.agent.name,
    });
  }

  if (payout.taxReserveSuggested > 0) {
    entries.push({
      date: new Date().toISOString().slice(0, 10),
      type: "tax_reserve",
      description: `Suggested tax reserve`,
      debit: 0,
      credit: payout.taxReserveSuggested,
    });
  }

  for (const p of agentPayments) {
    const scheduled = p.status === "scheduled";
    entries.push({
      date: p.date,
      type: "payment",
      description: `${scheduled ? "Scheduled payment" : "Payment"} ${p.reference ? "#" + p.reference : ""} ${p.method ? "(" + p.method + ")" : ""}${scheduled && p.scheduledDate ? ` — due ${p.scheduledDate}` : ""}`.trim(),
      debit: 0,
      // A scheduled payment is a promise, not money sent yet — it doesn't
      // reduce the running balance until it's actually disbursed.
      credit: scheduled ? 0 : p.amount,
      refId: p.id,
    });
  }

  for (const dp of disputes.filter((x) => x.agentId === agent.id && x.status === "approved")) {
    entries.push({
      date: (dp.resolvedAt || dp.createdAt).slice(0, 10),
      type: "correction",
      description: `Correction approved: ${dp.reason}`,
      debit: 0,
      credit: 0,
      refId: dp.invoiceId,
    });
  }

  // Manual adjustments / correction center entries
  for (const adj of adjustments.filter((x) => x.agentId === agent.id)) {
    const positive = adj.kind === "credit" || adj.kind === "manual_override" || adj.kind === "pending_balance";
    entries.push({
      date: adj.date,
      type: adj.kind,
      description: adj.note || labelFor(adj.kind),
      debit: positive ? adj.amount : 0,
      credit: positive ? 0 : adj.amount,
      refId: adj.id,
      refLabel: adj.invoiceId ?? undefined,
    });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));

  let balance = 0;
  const ledger: LedgerEntry[] = entries.map((e) => {
    balance += e.debit - e.credit;
    return { ...e, balance };
  });

  const totalEarned = ledger.reduce((s, e) => s + e.debit, 0);
  const openAdvance = Math.max(0, payout.advanceApplied - totalPaid);

  return {
    agent,
    payout,
    payments: agentPayments,
    totalPaid,
    totalEarned,
    pendingBalance: balance,
    openAdvance,
    taxReserve: payout.taxReserveSuggested,
    ledger,
  };
}

export function buildAllWallets(
  agents: Agent[],
  invoices: Invoice[],
  financeCompanies: FinanceCompany[],
  tiers: PersonalTier[],
  overrides: OverrideLevel[],
  payments: Payment[],
  disputes: Dispute[],
  adjustments: Adjustment[] = []
): AgentWallet[] {
  const payouts = calcPayouts(agents, invoices, financeCompanies, tiers, overrides);
  return agents.map((a) => {
    const p = payouts.find((x) => x.agent.id === a.id)!;
    return buildWallet(a, p, payments, disputes, adjustments, invoices, financeCompanies);
  });
}

export function labelFor(k: Adjustment["kind"]): string {
  switch (k) {
    case "advance": return "Advance issued";
    case "deduction": return "Deduction";
    case "credit": return "Credit / bonus";
    case "chargeback": return "Chargeback";
    case "manual_override": return "Manual override";
    case "payment_correction": return "Payment correction";
    case "split_correction": return "Split correction";
    case "pending_balance": return "Pending balance adjustment";
  }
}

/* -------- Explain This Commission -------- */

export function explainInvoice(
  inv: Invoice,
  c: InvoiceCalc,
  agent: Agent | null,
  payout: AgentPayout | null,
  company: Company,
  lang: Lang = "en"
): string[] {
  const cur = company.currency;
  const lines: string[] = [];
  const repName = agent?.name || (lang === "es" ? "Vendedor" : "Salesperson");
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const m = (n: number) => fmtMoney(n, cur);

  const saleTypeLabel = (st?: string, l: Lang = "en"): string => {
    const en: Record<string, string> = {
      credit_card: "Credit card",
      finance: "Finance",
      check: "Check",
      wire: "Wire",
      cash: "Cash deposit",
    };
    const es: Record<string, string> = {
      credit_card: "Tarjeta de crédito",
      finance: "Financiamiento",
      check: "Cheque",
      wire: "Transferencia",
      cash: "Depósito en efectivo",
    };
    if (!st) return l === "es" ? "no especificado" : "not specified";
    return (l === "es" ? es : en)[st] || st;
  };
  const dealerFeeVal = inv.dealerFee != null ? inv.dealerFee : c.financeCo?.dealerFee ?? 0;
  const ccpfVal = inv.saleType === "credit_card" ? inv.salesAmount * (inv.ccpfPercent ?? 0.035) : 0;
  const adminFeeVal = inv.salesAmount * (inv.adminFeePercent || 0);
  const isFinance = inv.saleType === "finance";
  const showDealerFee = isFinance && dealerFeeVal > 0;

  if (lang === "es") {
    lines.push(
      `Invoice ${inv.number} para ${inv.customerName || "cliente"} con fecha ${inv.date}, vendedor ${agent?.name || "—"}.`
    );
    if (inv.commissionLevel)
      lines.push(`Nivel de comisión del vendedor: ${inv.commissionLevel}.`);
    if (inv.saleType)
      lines.push(`Tipo de venta: ${saleTypeLabel(inv.saleType, "es")}.`);
    lines.push(
      `El monto de venta es ${m(inv.salesAmount)} y el costo del producto es ${m(inv.productCost)}.`
    );
    lines.push(
      `La financiera aprobó ${pct(inv.approvalPercent)} de la venta, por lo que ${m(c.approvalAmount)} es el monto aprobado.`
    );
    if (inv.discount) lines.push(`Se aplicó un descuento de ${m(inv.discount)}.`);
    if (isFinance && c.financeCo) {
      const ff = c.financeCo.defaultFee * inv.salesAmount;
      lines.push(
        `La financiera ${c.financeCo.name} cobra una comisión del ${pct(c.financeCo.defaultFee)} (${m(ff)}) y cuota administrativa de ${m(c.financeCo.adminFee)}.`
      );
    }
    if (showDealerFee)
      lines.push(
        `Cuota de dealer del banco financiero (Finance Bank Dealer Fee): ${m(dealerFeeVal)}${inv.dealerFee != null ? " (override del invoice)" : ""}.`
      );
    if (ccpfVal > 0)
      lines.push(
        `C.C.P.F. (Cuota por procesamiento de tarjeta) al ${pct(inv.ccpfPercent ?? 0.035)} = ${m(ccpfVal)}.`
      );
    if (inv.adminFeePercent)
      lines.push(
        `Admin fee del invoice al ${pct(inv.adminFeePercent)} sobre la venta = ${m(adminFeeVal)}.`
      );
    if (inv.approvedAdvanceAmount)
      lines.push(`Advance aprobado para este vendedor: ${m(inv.approvedAdvanceAmount)}.`);
    if (inv.pendingAdvanceBalance)
      lines.push(`Saldo pendiente del advance: ${m(inv.pendingAdvanceBalance)}.`);
    if (inv.charges.length)
      lines.push(
        `Cargos adicionales: ${inv.charges.map((x) => `${x.label || "cargo"} ${m(x.amount)}`).join(", ")}.`
      );
    if (inv.credits.length)
      lines.push(
        `Créditos sumados: ${inv.credits.map((x) => `${x.label || "crédito"} ${m(x.amount)}`).join(", ")}.`
      );
    lines.push(
      `Los cargos totales suman ${m(c.totalCharges)} y los créditos totales ${m(c.totalCredits)}.`
    );
    lines.push(
      `Total general = aprobación − descuento − cargos + créditos = ${m(c.grandTotal)}.`
    );
    lines.push(
      `Al restar el costo del producto, el profit es ${m(c.profit)}.`
    );
    if (c.adminFeeAmount > 0)
      lines.push(
        `El admin fee (${m(c.adminFeeAmount)}) no reduce la venta ni el profit — se descuenta directamente de la comisión del vendedor.`
      );
    const baseLabelEs = inv.commissionBase === "product_cost" ? "el costo del producto" : "el profit";
    lines.push(
      `La comisión se calcula sobre ${baseLabelEs} (base = ${m(c.commissionableBase)}).`
    );
    if (payout) {
      const effectiveRate = inv.commissionPercentOverride ?? payout.personalRate;
      const rateSrc = inv.commissionPercentOverride != null
        ? "override admin de este invoice"
        : (agent?.commissionPercent != null ? "asignada al vendedor" : "según el tier por volumen");
      lines.push(
        `La tasa aplicada en este invoice es ${pct(effectiveRate)} (${rateSrc}); en el período ${repName} genera ${m(payout.personalCommission)} de comisión personal.`
      );
      if (payout.overrideTotal > 0)
        lines.push(
          `Los overrides del downline suman ${m(payout.overrideTotal)} a través de ${payout.downline.length} agente(s).`
        );
      if (inv.advanceApplied)
        lines.push(`Se descontó un advance de ${m(inv.advanceApplied)} en este invoice.`);
      if (inv.specialDeductions)
        lines.push(
          `Se aplicaron deducciones especiales de ${m(inv.specialDeductions)} en este invoice.`
        );
      lines.push(
        `Reserva de impuestos sugerida al ${pct(inv.taxReservePercent)} = ${m(payout.taxReserveSuggested)}.`
      );
      lines.push(
        `El pago final del período es ${m(payout.finalPayable)}; el saldo pendiente es ${m(payout.pendingBalance)}.`
      );
    }
    return lines;
  }

  lines.push(
    `Invoice ${inv.number} for ${inv.customerName || "customer"} dated ${inv.date}, salesperson ${agent?.name || "—"}.`
  );
  if (inv.commissionLevel)
    lines.push(`Sales rep commission level: ${inv.commissionLevel}.`);
  if (inv.saleType) lines.push(`Sale type: ${saleTypeLabel(inv.saleType, "en")}.`);
  lines.push(
    `Sales amount is ${m(inv.salesAmount)} and product cost is ${m(inv.productCost)}.`
  );
  lines.push(
    `Lender approved ${pct(inv.approvalPercent)} of the sale, so ${m(c.approvalAmount)} is the approval amount.`
  );
  if (inv.discount) lines.push(`A discount of ${m(inv.discount)} was applied.`);
  if (isFinance && c.financeCo) {
    const ff = c.financeCo.defaultFee * inv.salesAmount;
    lines.push(
      `Finance company ${c.financeCo.name} charges a ${pct(c.financeCo.defaultFee)} fee (${m(ff)}) and admin fee of ${m(c.financeCo.adminFee)}.`
    );
  }
  if (showDealerFee)
    lines.push(
      `Finance Bank Dealer Fee: ${m(dealerFeeVal)}${inv.dealerFee != null ? " (per-invoice override)" : ""}.`
    );
  if (ccpfVal > 0)
    lines.push(
      `C.C.P.F. (Credit Card Processing Fee) at ${pct(inv.ccpfPercent ?? 0.035)} = ${m(ccpfVal)}.`
    );
  if (inv.adminFeePercent)
    lines.push(
      `Invoice admin fee at ${pct(inv.adminFeePercent)} of sales = ${m(adminFeeVal)}.`
    );
  if (inv.approvedAdvanceAmount)
    lines.push(`Approved advance for this rep: ${m(inv.approvedAdvanceAmount)}.`);
  if (inv.pendingAdvanceBalance)
    lines.push(`Pending advance balance: ${m(inv.pendingAdvanceBalance)}.`);
  if (inv.charges.length)
    lines.push(
      `Extra charges: ${inv.charges.map((x) => `${x.label || "charge"} ${m(x.amount)}`).join(", ")}.`
    );
  if (inv.credits.length)
    lines.push(
      `Credits added back: ${inv.credits.map((x) => `${x.label || "credit"} ${m(x.amount)}`).join(", ")}.`
    );
  lines.push(
    `Total charges sum to ${m(c.totalCharges)} and total credits to ${m(c.totalCredits)}.`
  );
  lines.push(
    `Grand total = approval − discount − charges + credits = ${m(c.grandTotal)}.`
  );
  lines.push(
    `After subtracting product cost, profit is ${m(c.profit)}.`
  );
  if (c.adminFeeAmount > 0)
    lines.push(
      `The admin fee (${m(c.adminFeeAmount)}) doesn't reduce the sale or the profit — it's deducted directly from the seller's commission.`
    );
  const baseLabelEn = inv.commissionBase === "product_cost" ? "product cost" : "profit";
  lines.push(
    `Commission % is applied to ${baseLabelEn} (base = ${m(c.commissionableBase)}).`
  );
  if (payout) {
    const effectiveRate = inv.commissionPercentOverride ?? payout.personalRate;
    const rateSrc = inv.commissionPercentOverride != null
      ? "admin override on this invoice"
      : (agent?.commissionPercent != null ? "set on the salesperson" : "from volume tier");
    lines.push(
      `Rate applied on this invoice is ${pct(effectiveRate)} (${rateSrc}); for the period ${repName} earns ${m(payout.personalCommission)} in personal commission.`
    );
    if (payout.overrideTotal > 0)
      lines.push(
        `Downline overrides add ${m(payout.overrideTotal)} across ${payout.downline.length} agent(s).`
      );
    if (inv.advanceApplied)
      lines.push(`An advance of ${m(inv.advanceApplied)} was deducted on this invoice.`);
    if (inv.specialDeductions)
      lines.push(
        `Special deductions of ${m(inv.specialDeductions)} were applied on this invoice.`
      );
    lines.push(
      `Suggested tax reserve at ${pct(inv.taxReservePercent)} = ${m(payout.taxReserveSuggested)}.`
    );
    lines.push(
      `Final payable for the period is ${m(payout.finalPayable)}; pending balance is ${m(payout.pendingBalance)}.`
    );
  }
  return lines;
}

/* -------- AI Coach: month-over-month commission insight -------- */

export type CoachInsight = {
  kind: "positive" | "negative" | "neutral";
  headline: string;
  bullets: string[];
};

function monthRange(offsetMonths: number) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + offsetMonths;
  const start = new Date(y, m, 1);
  const end = offsetMonths === 0 ? now : new Date(y, m + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

/** Rule-based insight comparing this agent's current-month commission
 *  to last month, surfacing the most likely driver (low approval %,
 *  pending advances, or downline override growth). Returns null when
 *  there isn't enough data for a meaningful comparison. */
export function computeCoachInsight(
  agent: Agent,
  agents: Agent[],
  invoices: Invoice[],
  financeCompanies: FinanceCompany[],
  tiers: PersonalTier[],
  overrides: OverrideLevel[],
  lang: Lang = "en",
  currency = "USD"
): CoachInsight | null {
  const isEs = lang === "es";
  const cur = monthRange(0);
  const prev = monthRange(-1);
  const inRange = (d: string, r: { start: string; end: string }) => d >= r.start && d <= r.end;

  const curInvoices = invoices.filter((i) => inRange(i.date, cur));
  const prevInvoices = invoices.filter((i) => inRange(i.date, prev));

  const curPayouts = calcPayouts(agents, curInvoices, financeCompanies, tiers, overrides);
  const prevPayouts = calcPayouts(agents, prevInvoices, financeCompanies, tiers, overrides);
  const curP = curPayouts.find((p) => p.agent.id === agent.id);
  const prevP = prevPayouts.find((p) => p.agent.id === agent.id);
  if (!curP || !prevP) return null;

  const curTotal = curP.personalCommission + curP.overrideTotal;
  const prevTotal = prevP.personalCommission + prevP.overrideTotal;
  if (prevTotal <= 0) return null;

  const pctChange = (curTotal - prevTotal) / prevTotal;
  const pct = (n: number) => `${Math.abs(Math.round(n * 100))}%`;
  const m = (n: number) => fmtMoney(n, currency);

  if (pctChange <= -0.03) {
    const lowApproval = curP.invoices.filter((c) => c.invoice.approvalPercent < 0.9);
    const pendingAdvance = curP.invoices.reduce(
      (s, c) => s + (c.invoice.pendingAdvanceBalance || 0),
      0
    );
    const bullets: string[] = [];
    if (lowApproval.length > 0) {
      const avgApproval =
        lowApproval.reduce((s, c) => s + c.invoice.approvalPercent, 0) / lowApproval.length;
      bullets.push(
        isEs
          ? `Tienes ${lowApproval.length} venta${lowApproval.length > 1 ? "s" : ""} con Approval del ${pct(avgApproval)}.`
          : `You have ${lowApproval.length} sale${lowApproval.length > 1 ? "s" : ""} with Approval at ${pct(avgApproval)}.`
      );
    }
    if (pendingAdvance > 0) {
      bullets.push(
        isEs
          ? `También tienes un advance pendiente de ${m(pendingAdvance)}.`
          : `You also have a pending advance of ${m(pendingAdvance)}.`
      );
    }
    if (bullets.length === 0) {
      bullets.push(
        isEs
          ? "Revisa tus invoices recientes para más detalle."
          : "Review your recent invoices for more detail."
      );
    } else {
      bullets.push(
        isEs ? "Te recomiendo revisar estos invoices." : "I recommend reviewing these invoices."
      );
    }
    return {
      kind: "negative",
      headline: isEs
        ? `Tu comisión bajó este mes un ${pct(pctChange)}.`
        : `Your commission dropped ${pct(pctChange)} this month.`,
      bullets,
    };
  }

  if (pctChange >= 0.03) {
    const overrideGrowth =
      prevP.overrideTotal > 0
        ? (curP.overrideTotal - prevP.overrideTotal) / prevP.overrideTotal
        : curP.overrideTotal > 0
          ? 1
          : 0;
    const downlineIds = new Set(curP.downline.map((d) => d.agent.id));
    const downlineNewSales = curInvoices.filter((i) => downlineIds.has(i.agentId)).length;

    if (overrideGrowth > 0 && curP.overrideTotal > 0) {
      const bullets = [
        isEs ? "Buen trabajo." : "Good work.",
      ];
      if (downlineNewSales > 0) {
        bullets.push(
          isEs
            ? `Tu downline generó ${downlineNewSales} nueva${downlineNewSales > 1 ? "s" : ""} venta${downlineNewSales > 1 ? "s" : ""}.`
            : `Your downline generated ${downlineNewSales} new sale${downlineNewSales > 1 ? "s" : ""}.`
        );
      }
      return {
        kind: "positive",
        headline: isEs
          ? `Notamos que tus overrides crecieron un ${pct(overrideGrowth)}.`
          : `We noticed your overrides grew ${pct(overrideGrowth)}.`,
        bullets,
      };
    }

    return {
      kind: "positive",
      headline: isEs
        ? `Tu comisión subió este mes un ${pct(pctChange)}.`
        : `Your commission is up ${pct(pctChange)} this month.`,
      bullets: [isEs ? "Sigue así." : "Keep it up."],
    };
  }

  return null;
}

/* -------- Who this invoice pays: seller's upline (overrides) + seller/split -------- */

export type InvolvedRow = { name: string; role: string; amount: number; agentId: string | null };

/** Everyone this invoice pays: the seller's sponsor chain (who earn an
 *  override on this profit — topmost sponsor first), then the seller
 *  themselves, split per participant when the invoice has a split. */
export function computeInvolved(
  inv: Invoice,
  c: InvoiceCalc,
  agents: Agent[],
  overrides: OverrideLevel[],
  lang: Lang = "en"
): InvolvedRow[] {
  const seller = agents.find((a) => a.id === inv.agentId);
  if (!seller) return [];
  const overrideMap = new Map(overrides.map((o) => [o.level, o.rate]));

  const upline: { agent: Agent; level: number }[] = [];
  const visited = new Set<string>([seller.id]);
  let cursor: Agent = seller;
  let level = 1;
  while (cursor.sponsorId && !visited.has(cursor.sponsorId)) {
    const sponsor = agents.find((a) => a.id === cursor.sponsorId);
    if (!sponsor) break;
    visited.add(sponsor.id);
    upline.push({ agent: sponsor, level });
    cursor = sponsor;
    level++;
  }
  upline.reverse(); // topmost sponsor first

  const rate = inv.commissionPercentOverride ?? seller.commissionPercent ?? 0;
  // Admin fee comes straight out of the seller's own commission — never
  // out of the sale/profit or the overrides paid on it.
  const personal = Math.max(0, Math.max(0, c.commissionableBase) * rate - c.adminFeeAmount);
  const splits = inv.split?.participants ?? [];

  const rows: InvolvedRow[] = upline.map((u) => ({
    name: u.agent.name,
    role: `Override L${u.level} (${((overrideMap.get(u.level) || 0) * 100).toFixed(2)}%)`,
    amount: Math.max(0, c.commissionProfit) * (overrideMap.get(u.level) || 0),
    agentId: u.agent.id,
  }));

  if (splits.length > 0) {
    for (const p of splits) {
      const roleName = p.role === "custom" && p.customRoleLabel ? p.customRoleLabel : p.role.replace(/_/g, " ");
      rows.push({
        name: p.displayName || "—",
        role: `${roleName} (${(p.splitPercent * 100).toFixed(0)}%)`,
        amount: personal * p.splitPercent,
        agentId: p.agentId,
      });
    }
  } else {
    rows.push({ name: seller.name, role: lang === "es" ? "Vendedor" : "Salesperson", amount: personal, agentId: seller.id });
  }

  return rows;
}

export { calcInvoice };
