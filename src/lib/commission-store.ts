import { create, type StateCreator } from "zustand";
import { persist } from "zustand/middleware";

export type W9Status = "missing" | "pending" | "valid";

export type Agent = {
  id: string;
  name: string;
  email: string;
  sponsorId: string | null;
  w9Status?: W9Status;
  state?: string;
  paymentMethod?: string;
  taxReservePercent?: number;
  commissionPercent?: number; // default personal commission rate (e.g. 0.08 = 8%)
  commissionMode?: "percent" | "fixed"; // "fixed" pays fixedCommissionAmount per invoice instead of a %
  fixedCommissionAmount?: number; // flat $ paid per qualifying invoice when commissionMode === "fixed"
  level?: string;             // commission level label (e.g. Junior Rep, Sales Rep, Manager)
  avatarUrl?: string;         // base64 or URL for profile photo
  companyName?: string;       // LLC/business name this agent gets paid under, if any (e.g. subcontractors)
  // Three independent axes, per the client's financial-integrity request —
  // deliberately NOT collapsed into one field:
  //  1. Service role   → `level` (position name), already its own field.
  //  2. Worker relationship → `payrollType`: the LEGAL employment
  //     classification (W-2 employee vs. 1099 contractor).
  //  3. Payment treatment → `paymentTreatment`: which system actually pays
  //     them for job-based work. Usually mirrors payrollType, but they can
  //     diverge on purpose — e.g. a W-2 installer who is still paid
  //     piece-rate per job through Work Statements rather than through
  //     hourly Payroll. Left unset, it's inferred from payrollType (see
  //     resolvePaymentTreatment) so existing data behaves exactly as before.
  payrollType?: "w2" | "contractor";
  paymentTreatment?: "payroll" | "contractor_payables";
  // Technicians tab fields (Billing & Technicians rebuild) — an agent is
  // treated as a technician there once `classification` is set. Reuses this
  // same Agent record (not a separate table) so the technician login role,
  // my_agent_id() linkage and the masked tax-id table all keep working
  // without a second, parallel identity.
  phone?: string;
  classification?: TechnicianClassification;
  active?: boolean; // default true when undefined — soft-disable without deleting history
  technicianNotes?: string;
};

export const TECH_CLASSIFICATIONS = [
  "installer", "plumber", "electrician", "service_tech", "lead_tech", "apprentice", "subcontractor",
] as const;
export type TechnicianClassification = typeof TECH_CLASSIFICATIONS[number];
export const TECH_CLASSIFICATION_LABEL: Record<TechnicianClassification, { es: string; en: string }> = {
  installer: { es: "Instalador", en: "Installer" },
  plumber: { es: "Plomero", en: "Plumber" },
  electrician: { es: "Electricista", en: "Electrician" },
  service_tech: { es: "Técnico de servicio", en: "Service Tech" },
  lead_tech: { es: "Técnico líder", en: "Lead Tech" },
  apprentice: { es: "Aprendiz", en: "Apprentice" },
  subcontractor: { es: "Subcontratista", en: "Subcontractor" },
};

/** The system that actually pays this agent for job-based work. Falls back
 * to inferring from payrollType when not explicitly set, so a company that
 * never touches this new field sees no change in behavior. */
export function resolvePaymentTreatment(agent: Pick<Agent, "payrollType" | "paymentTreatment">): "payroll" | "contractor_payables" {
  if (agent.paymentTreatment) return agent.paymentTreatment;
  return agent.payrollType === "w2" ? "payroll" : "contractor_payables";
}

/** A technician's tax ID, MASKED: only ever the last 4 digits are stored —
 * never the full SSN/EIN. Lives in its own table with its own RLS
 * (admin/accountant only), separate from the company-wide-readable `agents`
 * table, because Postgres RLS is row-level — a sensitive column bolted onto
 * `agents` would be readable by every rep/technician in the company. */
export type AgentTaxId = {
  id: string; // == agentId (one row per agent, agent_id is this table's own primary key)
  last4: string;
  updatedAt: string;
};

export type FinanceCompany = {
  id: string;
  name: string;
  defaultFee: number;
  dealerFee: number;
  adminFee: number;
  usesApprovalDiscount: boolean;
  active: boolean;
  notes: string;
};

export type LineItem = { label: string; amount: number };

export type Product = {
  id: string;
  name: string;
  sku: string;
  kind: "product" | "service" | "plan";
  price: number;
  cost: number;
  priceEditable: boolean;
  active: boolean;
  notes: string;
  photoUrl?: string; // base64 data URL thumbnail
};

export type Invoice = {
  id: string;
  number: string;
  date: string;
  status: "draft" | "pending" | "paid" | "on_hold";
  agentId: string;
  financeCompanyId: string | null;
  customerName: string;
  customerNotes: string;
  salesAmount: number;
  productCost: number;
  approvalPercent: number;
  discount: number;
  charges: LineItem[];
  credits: LineItem[];
  advanceApplied: number;
  specialDeductions: number;
  taxReservePercent: number;
  paid: boolean;
  saleType?: SaleType;
  ccpfPercent?: number;          // Credit Card Processing Fee (default 0.035)
  adminFeePercent?: number;      // Per-invoice admin fee % of sales
  dealerFee?: number;            // Finance Bank Dealer Fee (override / per invoice)
  approvedAdvanceAmount?: number;
  pendingAdvanceBalance?: number;
  commissionLevel?: string;      // e.g. Junior Rep, Sales Rep, Manager (auto-pulled from agent)
  commissionBase?: "profit" | "product_cost"; // base used for commission % (default profit)
  commissionPercentOverride?: number; // admin-only per-invoice override of rep's commission % (decimal, e.g. 0.1 = 10%)
  // Admin-only per-invoice override of a specific sponsor's override $
  // amount on THIS sale — keyed by that sponsor agent's id. Used from the
  // "Who's involved" dialog when the computed default needs a manual
  // correction; feeds both the preview (computeInvolved) and the actual
  // payout math (calcPayouts), so they never disagree. Unset agentIds fall
  // back to the normal computed amount.
  overrideAmountOverrides?: Record<string, number>;
  // Itemized deductions against a specific sponsor's override on THIS sale
  // (e.g. a chargeback, a correction) — keyed by that sponsor agent's id.
  // Subtracted from the gross override (computed default, or the manual
  // override above when set) everywhere that amount is used: the "Who's
  // involved" preview, generated PDFs, and calcPayouts.
  overrideDeductions?: Record<string, { id: string; label: string; amount: number }[]>;
  brandingSnapshot?: CompanyBranding & { companyName: string; address: string; email: string; phone: string; taxId: string; currency: string }; // captured at PDF generation
  split?: InvoiceSplit | null;
  pdfHistory?: InvoicePdfRecord[];
  // "General invoice" — flat pay per job (subcontractors like plumbers),
  // no product-cost cascade, no override to sponsors. Snapshotted at
  // creation from the seller's position so calc functions stay
  // self-contained (don't need to look up agents/positions).
  isGeneralInvoice?: boolean;
  jobType?: "installation" | "service";
  fixedPay?: number;             // editable — flat rates vary by office
  extras?: InvoiceExtra[];       // each extra adds its own $ on top of the fixed pay
  // Customer-facing cash invoice — a receipt handed to the customer (not the
  // internal commission document), used when they pay cash in installments.
  customerAddress?: string;
  customerPhone?: string;
  invoiceItemLabel?: string;              // e.g. "Water Treatment System" — the main line item's name
  customerPayments?: CustomerPayment[];   // "Abono $X · date" entries the customer has made
  paymentPlanNote?: string;               // free text, e.g. "remaining balance in 13 monthly installments..."
};

export type CustomerPayment = { label: string; amount: number; date: string };

export type InvoiceExtra = { category: string; amount: number };

export type InvoicePdfRecord = {
  at: string;
  by: string;
  reason: "initial" | "split_changed" | "manual_regeneration" | "approval";
  fileName: string;
  splitSnapshot: SplitParticipant[] | null;
  brandingSnapshot: NonNullable<Invoice["brandingSnapshot"]>;
};

/* ---------- Split commissions ---------- */

export type SplitParticipantRole =
  | "sales_rep"
  | "setter"
  | "closer"
  | "manager"
  | "dealer"
  | "upline"
  | "installer"
  | "partner"
  | "override_recipient"
  | "custom";

export type SplitParticipant = {
  id: string;
  agentId: string | null;       // optional; can be a non-rep partner
  displayName: string;          // shown when no agentId
  role: SplitParticipantRole;
  customRoleLabel?: string;     // when role === "custom"
  splitPercent: number;         // decimal of the main commission pool, 0..1
  commissionLevel?: string;     // optional level label
  notes?: string;
};

export type SplitAuditEntry = {
  at: string;
  by: string;                   // user/role label
  action: "created" | "updated" | "rule_applied" | "template_applied" | "cleared" | "approved" | "recalculated";
  message: string;
  snapshot: SplitParticipant[];
};

export type InvoiceSplit = {
  participants: SplitParticipant[];
  appliedRuleId: string | null;
  appliedTemplateId: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  history: SplitAuditEntry[];
};

export type SplitTemplate = {
  id: string;
  name: string;                 // e.g. "60/40 Closer/Setter"
  description: string;
  positions: {
    role: SplitParticipantRole;
    customRoleLabel?: string;
    splitPercent: number;       // decimal
    displayName?: string;
  }[];
};

export type SplitRuleCriteria = {
  industryTemplateId?: string;   // matches IndustryTemplate.id
  financeCompanyId?: string;
  repLevel?: string;             // matches Agent.level / position name
  commissionLevel?: string;      // matches Invoice.commissionLevel
  managerAgentId?: string;       // matches the rep's sponsor
  dealType?: SaleType;
};

export type SplitRule = {
  id: string;
  name: string;
  priority: number;              // higher wins
  active: boolean;
  criteria: SplitRuleCriteria;
  templateId: string;
  notes?: string;
};

export type SaleType = "credit_card" | "finance" | "check" | "wire" | "cash";

export type PersonalTier = { minVolume: number; rate: number };
export type OverrideLevel = { level: number; rate: number };

export type CompensationPosition = {
  id: string;
  name: string;                    // e.g. "Junior Rep", "Sales Rep", "Manager"
  commissionPercent: number;       // decimal, e.g. 0.08 = 8%
  fixedPayout: number;             // flat $ added per qualifying invoice
  overrideEligible: boolean;       // can earn override on downline
  differentialOverridePercent: number; // bonus % vs immediate downline rate
  splitDefaultPercent: number;     // default split share when on a split deal (e.g. 0.5)
  effectiveFrom: string;           // YYYY-MM-DD
  effectiveTo: string;             // YYYY-MM-DD ("" = open)
  active: boolean;
  financeCompanyId: string | null; // null = applies to all
  productRule: string;             // free-text product/SKU filter or note
  minApprovalPercent: number;      // 0..1 (0 = no minimum)
  specialDeductionPercent: number; // decimal
  notes: string;
  // "General invoice" roles (e.g. subcontractors like plumbers) get paid a
  // flat amount per job — installation vs. service — with no product-cost
  // cascade and no override to sponsors. Level/cost don't apply to them.
  isGeneralInvoice?: boolean;
  installFixedPay?: number;        // flat $ for an "installation" job
  serviceFixedPay?: number;        // flat $ for a "service" job — rates vary by office, so both are editable
};

export type InvoiceTemplateId =
  | "classic"
  | "modern-finance"
  | "compact"
  | "detailed-commission"
  | "minimal";

export type CompanyBranding = {
  logoDataUrl: string;          // base64 data URL ("" = none)
  brandColor: string;           // primary
  brandColorSecondary: string;  // accent
  footerText: string;
  disclaimerText: string;
  invoiceTemplate: InvoiceTemplateId;
};

export type Company = {
  name: string;
  address: string;
  email: string;
  phone: string;
  taxId: string;
  currency: string;
  invoicePrefix: string;
  brandColor: string;
  // Branding (per-company; multi-company safe — not hardcoded)
  logoDataUrl: string;
  brandColorSecondary: string;
  footerText: string;
  disclaimerText: string;
  invoiceTemplate: InvoiceTemplateId;
  // Chosen once in the Setup Wizard: whether reps' pay is entered as a flat
  // $ (per invoice — doubles as "Costo del producto") or as a %. Only the
  // matching field is shown across the app, instead of both at once.
  commissionEntryMode: "fixed" | "percent";
  // Client-configurable label for the "General invoice" (isGeneralInvoice)
  // role — some companies call them "Technicians", others "Installers",
  // "Contractors", etc. Empty string = fall back to the built-in EN/ES
  // default. Used anywhere the Billing & Technician Payables screens would
  // otherwise hardcode "Technician"/"Técnico".
  technicianTermSingular: string;
  technicianTermPlural: string;
  // Off by default — a second "original" work statement for the same job +
  // technician + classification requires an explicit non-original type
  // (supplemental/correction/etc.) unless an admin turns this on.
  allowMultipleOriginalStatements: boolean;
  // Configurable withholding lines (name + %) applied to W-2 Payroll Runs —
  // see withholdingsFor(). Defaults to DEFAULT_WITHHOLDINGS.
  withholdingRates: WithholdingRate[];
};

/** Resolves the configurable "technician" label — falls back to the
 * built-in default per language when the company hasn't set one. */
export function technicianTerm(company: Pick<Company, "technicianTermSingular" | "technicianTermPlural">, isEs: boolean, plural = false): string {
  const custom = plural ? company.technicianTermPlural : company.technicianTermSingular;
  if (custom?.trim()) return custom.trim();
  if (isEs) return plural ? "Técnicos" : "Técnico";
  return plural ? "Technicians" : "Technician";
}

export type Payment = {
  id: string;
  agentId: string;
  date: string;
  amount: number;
  method: string;
  notes: string;
  reference: string;
  scheduledDate?: string;
  status?: "scheduled" | "paid";
};

/** One private payout statement, generated per (invoice, recipient) — the
 *  seller, each split participant, and each override recipient on that
 *  sale all get their own, so nobody sees anyone else's numbers. Admin
 *  approves/rejects, schedules, and marks paid (which posts a matching
 *  Payment so the rep's Wallet stays the single source of truth). */
export type PayoutDocumentStatus = "pending" | "approved" | "rejected" | "paid";

export type PayoutDocument = {
  id: string;
  number: string; // "PD-000001"
  invoiceId: string;
  agentId: string;
  roleLabel: string; // e.g. "Manager", "Senior Rep" — the recipient's position/level
  description: string; // e.g. "Level 1 override — 5.00% of net profit"
  amount: number; // this invoice's share owed to this recipient
  status: PayoutDocumentStatus;
  scheduledDate: string | null;
  rejectedReason: string | null;
  deliveredAt: string | null;
  pdfVersions: number;
  lastPdfAt: string | null;
  lastPdfBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/* ========================================================================
 * BILLING & TECHNICIANS — rebuilt to match the client's Lovable mockups.
 * Job is now the central operational entity (who went where, when, to do
 * what) — separate from the sales/commission Invoice. A Job optionally
 * links to a sale Invoice (`saleInvoiceId`) for reference only; it NEVER
 * creates or touches a commission. Customer Invoices and Work Statements
 * both hang off a Job, independently — a Job can have a customer invoice,
 * technician pay, both, or neither.
 * ======================================================================== */

export type GeoPoint = { lat: number; lng: number };
export type StatementAttachment = { id: string; name: string; url: string };
export type DocEvent = { at: string; actor: string; type: string; message: string };
export type DocPdfRecord = { at: string; by: string };

// ---------- Jobs ----------
export type JobStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export const JOB_TYPES = ["Installation", "Repair", "Service Call", "Emergency", "Maintenance", "Warranty"] as const;

export type Job = {
  id: string;
  number: string; // "JOB-000001"
  technicianId: string | null;
  customerName: string;
  billingAddress: string;
  serviceAddress: string;
  serviceGeo?: GeoPoint | null;
  date: string;
  jobType: string;
  productInstalled: string;
  territory: string;
  status: JobStatus;
  attachments: StatementAttachment[];
  saleInvoiceId: string | null; // reference only — never generates commission from here
  salesAgentId?: string | null; // label only — never generates commission
  notes: string;
  createdAt: string;
  updatedAt: string;
};

// ---------- Customer Invoices ----------
export type CustomerInvoiceStatus =
  | "draft" | "sent" | "viewed" | "partially_paid"
  | "paid" | "overdue" | "cancelled" | "refunded";

export type CustomerInvoiceLineItem = {
  id: string;
  productId?: string | null;
  kind: "product" | "service";
  label: string;
  quantity: number;
  unitPrice: number;
};

export type CustomerInvoicePayment = {
  id: string;
  amount: number;
  date: string;
  method: string;
  reference: string;
  notes: string;
  recordedBy: string;
};

export type CustomerInvoice = {
  id: string;
  number: string; // "CINV-000001"
  jobId: string | null;
  saleInvoiceId: string | null;
  status: CustomerInvoiceStatus;
  customerName: string;
  customerEmail: string;
  billingAddress: string;
  billingGeo?: GeoPoint | null;
  serviceAddress: string;
  serviceGeo?: GeoPoint | null;
  invoiceDate: string;
  dueDate: string;
  lineItems: CustomerInvoiceLineItem[];
  discount: number;
  taxPercent: number;
  deposit: number;
  financingApplied: number;
  paymentTerms: string;
  notes: string;
  warrantyInfo: string;
  templateId?: InvoiceTemplateId;
  attachments: StatementAttachment[];
  payments: CustomerInvoicePayment[];
  history: DocEvent[];
  pdfHistory: DocPdfRecord[];
  sentAt: string | null;
  viewedAt: string | null;
  brandingSnapshot?: Invoice["brandingSnapshot"];
  createdAt: string;
  updatedAt: string;
};

/** Overdue is derived from dueDate, not stored — see displayCustomerInvoiceStatus. */
export function customerInvoiceTotals(ci: CustomerInvoice) {
  const lineTotal = ci.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
  const total = Math.max(0, lineTotal - ci.discount + lineTotal * ci.taxPercent - ci.deposit - ci.financingApplied);
  const paid = ci.payments.reduce((s, p) => s + (p.amount || 0), 0);
  const balance = Math.max(0, total - paid);
  return { lineTotal, total, paid, balance };
}

/** Auto-flips a non-final status to "overdue" once dueDate has passed and a
 *  balance remains — display-only, never stored, so it's always accurate. */
export function displayCustomerInvoiceStatus(ci: CustomerInvoice): CustomerInvoiceStatus {
  const finalStatuses: CustomerInvoiceStatus[] = ["paid", "cancelled", "refunded"];
  if (finalStatuses.includes(ci.status)) return ci.status;
  const { balance } = customerInvoiceTotals(ci);
  if (balance > 0 && ci.dueDate && ci.dueDate < new Date().toISOString().slice(0, 10)) return "overdue";
  return ci.status;
}

// ---------- Rate Plans ----------
export type RateRuleKind = "job_type" | "product" | "territory" | "service_call" | "emergency";

export type RatePlanRule = {
  id: string;
  kind: RateRuleKind;
  matchValue: string;
  amount: number;
  mode?: "amount" | "multiplier";
  mileageRate?: number | null;
  notes: string;
};

export type TechRatePlan = {
  id: string;
  name: string;
  technicianId: string | null; // null = company-wide
  effectiveFrom: string;
  effectiveTo: string | null;
  active: boolean;
  fixedInstallRate: number;
  serviceCallRate: number;
  emergencyRate: number;
  mileageRate: number;
  extraLaborHourlyRate: number;
  materialReimbursementPercent: number; // 0..1
  materialReimbursementCap: number; // 0 = no cap
  hourlyRate?: number; // used by Payroll Register (W-2)
  overtimeMultiplier?: number;
  rules: RatePlanRule[];
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type RateContext = { technicianId: string; date?: string; jobType?: string; product?: string; territory?: string };
export type ResolvedRate = { plan: TechRatePlan | null; baseLaborRate: number; mileageRate: number; source: string };

function planApplies(p: TechRatePlan, ctx: RateContext): boolean {
  if (!p.active) return false;
  if (p.technicianId && p.technicianId !== ctx.technicianId) return false;
  if (p.effectiveFrom && ctx.date && ctx.date < p.effectiveFrom) return false;
  if (p.effectiveTo && ctx.date && ctx.date > p.effectiveTo) return false;
  return true;
}

/** Newest applicable plan; technician-specific plans win over company-wide ones. */
export function resolveRatePlan(plans: TechRatePlan[], ctx: RateContext): TechRatePlan | null {
  const applicable = plans.filter((p) => planApplies(p, ctx));
  if (!applicable.length) return null;
  applicable.sort((a, b) => {
    const spec = Number(!!b.technicianId) - Number(!!a.technicianId);
    if (spec !== 0) return spec;
    return (b.effectiveFrom || "").localeCompare(a.effectiveFrom || "");
  });
  return applicable[0] ?? null;
}

const matchKey = (v: string) => (v || "").trim().toLowerCase();

/** Resolution: technician-specific plan wins over company-wide, then within
 *  the chosen plan, territory -> job type -> product rules apply in order
 *  (product applied last, so it wins ties), falling back to the plan's
 *  emergency/service-call/fixed-install rate. */
export function resolveRate(plans: TechRatePlan[], ctx: RateContext): ResolvedRate {
  const plan = resolveRatePlan(plans, ctx);
  if (!plan) return { plan: null, baseLaborRate: 0, mileageRate: 0, source: "No rate plan" };
  const find = (kind: RateRuleKind, value: string) =>
    plan.rules.find((r) => r.kind === kind && matchKey(r.matchValue) === matchKey(value));
  const byProduct = ctx.product ? find("product", ctx.product) : undefined;
  const byJobType = ctx.jobType ? find("job_type", ctx.jobType) : undefined;
  const byTerritory = ctx.territory ? find("territory", ctx.territory) : undefined;

  let baseLaborRate = plan.fixedInstallRate;
  let source = `${plan.name} — fixed installation rate`;
  const jt = (ctx.jobType || "").toLowerCase();
  if (jt.includes("emergency") && plan.emergencyRate > 0) { baseLaborRate = plan.emergencyRate; source = `${plan.name} — emergency rate`; }
  else if (jt.includes("service") && plan.serviceCallRate > 0) { baseLaborRate = plan.serviceCallRate; source = `${plan.name} — service call rate`; }
  let mileageRate = plan.mileageRate;

  const applyRule = (r: RatePlanRule, label: string) => {
    if (r.mode === "multiplier") { baseLaborRate = baseLaborRate * (r.amount || 0); source = `${plan.name} — ${label}: ${r.matchValue} (x${r.amount})`; }
    else { baseLaborRate = r.amount; source = `${plan.name} — ${label}: ${r.matchValue}`; }
    if (typeof r.mileageRate === "number" && r.mileageRate > 0) mileageRate = r.mileageRate;
  };
  if (byTerritory) applyRule(byTerritory, "territory");
  if (byJobType) applyRule(byJobType, "job type");
  if (byProduct) applyRule(byProduct, "product");
  if (plan.technicianId) source += " (technician-specific plan)";
  return { plan, baseLaborRate, mileageRate, source };
}

export function reimbursementFor(plan: TechRatePlan | null, receiptAmount: number): number {
  if (!plan) return 0;
  const raw = receiptAmount * (plan.materialReimbursementPercent || 0);
  return plan.materialReimbursementCap > 0 ? Math.min(raw, plan.materialReimbursementCap) : raw;
}

// ---------- Work Statements ----------
export type WorkStatementStatus = "draft" | "pending_approval" | "approved" | "rejected";
export type PayableStatus = "unpaid" | "in_batch" | "partially_paid" | "paid";
export type StatementType =
  | "original" | "additional_visit" | "supplemental" | "correction" | "reimbursement_only" | "warranty" | "rework";

export const STATEMENT_TYPES: { id: StatementType; label: { es: string; en: string } }[] = [
  { id: "original", label: { es: "Trabajo original", en: "Original Work" } },
  { id: "additional_visit", label: { es: "Visita adicional", en: "Additional Visit" } },
  { id: "supplemental", label: { es: "Suplementario", en: "Supplemental" } },
  { id: "correction", label: { es: "Corrección", en: "Correction" } },
  { id: "reimbursement_only", label: { es: "Solo reembolso", en: "Reimbursement Only" } },
  { id: "warranty", label: { es: "Garantía", en: "Warranty" } },
  { id: "rework", label: { es: "Retrabajo", en: "Rework" } },
];

export type RateSnapshot = {
  ratePlanId: string | null;
  ratePlanName: string;
  effectiveFrom: string;
  baseRate: number;
  mileageRate: number;
  extraLaborHourlyRate: number;
  serviceCallRate: number;
  emergencyRate: number;
  reimbursementPercent: number;
  reimbursementCap: number;
  source: string;
  capturedAt: string;
};

export type RateOverrideLog = { at: string; by: string; field: string; from: number; to: number; reason: string };

export type TechWorkStatement = {
  id: string;
  number: string; // "TWS-000001"
  jobId: string;
  technicianId: string;
  classification: TechnicianClassification | "";
  ratePlanId: string | null;
  baseLaborRate: number;
  additionalLabor: number;
  extraPlumbing: number;
  mileageMiles: number;
  mileageRate: number;
  materialReimbursement: number;
  deductions: number;
  chargebacks: number;
  corrections: number;
  regularHours?: number;
  overtimeHours?: number;
  notes: string;
  attachments: StatementAttachment[];
  status: WorkStatementStatus;
  approval: { by: string; at: string; note: string } | null;
  approvalHistory: DocEvent[];
  audit: DocEvent[];
  paymentStatus: PayableStatus;
  includedInWeeklyBatchId: string | null;
  batchStatus: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  isAdjustment: boolean;
  adjustsStatementId: string | null;
  statementType: StatementType;
  relatedStatementId?: string | null;
  typeReason?: string;
  supersededById?: string | null;
  supersededAt?: string | null;
  cancelled?: boolean;
  rateSnapshot: RateSnapshot | null;
  rateOverrides: RateOverrideLog[];
  pdfHistory: DocPdfRecord[];
  createdAt: string;
  updatedAt: string;
};

export type StatementTotals = { base: number; extras: number; mileage: number; reimbursements: number; deductions: number; total: number };

export function calcWorkStatement(ws: TechWorkStatement): StatementTotals {
  const n = (x: number | undefined) => x || 0;
  const base = n(ws.baseLaborRate);
  const mileage = n(ws.mileageMiles) * n(ws.mileageRate);
  const extras = n(ws.additionalLabor) + n(ws.extraPlumbing) + mileage;
  const reimbursements = n(ws.materialReimbursement);
  const deductions = n(ws.deductions) + n(ws.chargebacks);
  const total = base + extras + reimbursements - deductions + n(ws.corrections);
  return { base, extras, mileage, reimbursements, deductions, total };
}

export function sumTotals(list: StatementTotals[]): StatementTotals {
  return list.reduce(
    (a, t) => ({
      base: a.base + t.base, extras: a.extras + t.extras, mileage: a.mileage + t.mileage,
      reimbursements: a.reimbursements + t.reimbursements, deductions: a.deductions + t.deductions, total: a.total + t.total,
    }),
    { base: 0, extras: 0, mileage: 0, reimbursements: 0, deductions: 0, total: 0 }
  );
}

export const statementTypeOf = (ws: TechWorkStatement): StatementType => ws.statementType ?? "original";

export function isActiveStatement(ws: TechWorkStatement): boolean {
  if (ws.cancelled) return false;
  if (ws.supersededById) return false;
  if (ws.status === "rejected") return false;
  return true;
}

/** Existing active statement for the same job + technician + classification
 *  + statement type — used to block a duplicate "original" work statement. */
export function findActiveStatement(
  list: TechWorkStatement[],
  opts: { jobId: string; technicianId: string; classification: string; statementType?: StatementType; excludeId?: string }
): TechWorkStatement | undefined {
  const type = opts.statementType ?? "original";
  return list.find((ws) =>
    ws.id !== opts.excludeId &&
    ws.jobId === opts.jobId &&
    ws.technicianId === opts.technicianId &&
    (ws.classification || "") === (opts.classification || "") &&
    statementTypeOf(ws) === type &&
    isActiveStatement(ws)
  );
}

export function isPayoutEligible(ws: TechWorkStatement): { ok: boolean; reason: string | null } {
  if (ws.cancelled) return { ok: false, reason: "Cancelled" };
  if (ws.supersededById) return { ok: false, reason: "Superseded" };
  if (ws.status !== "approved") return { ok: false, reason: "Not approved" };
  if (ws.paymentStatus === "paid") return { ok: false, reason: "Already paid" };
  return { ok: true, reason: null };
}

// ---------- Weekly Statements ----------
export type WeeklyStatementStatus =
  | "draft" | "pending_review" | "approved" | "scheduled"
  | "partially_paid" | "paid" | "correction_requested" | "cancelled";

export const LOCKED_BATCH_STATUSES: WeeklyStatementStatus[] = ["approved", "scheduled", "partially_paid", "paid"];

export type WeeklyPaymentRecord = { id: string; date: string; amount: number; method: string; note: string };

export type WeeklyTechStatement = {
  id: string;
  number: string; // "WTS-000001"
  technicianId: string;
  weekStart: string;
  weekEnd: string;
  statementIds: string[];
  totals: StatementTotals;
  status: WeeklyStatementStatus;
  approval: { by: string; at: string; note: string } | null;
  scheduledFor: string | null;
  payments: WeeklyPaymentRecord[];
  paidAt: string | null;
  correctionRequest: { by: string; at: string; reason: string } | null;
  reopenings: { by: string; at: string; reason: string }[];
  audit: DocEvent[];
  pdfHistory: DocPdfRecord[];
  createdAt: string;
  updatedAt: string;
};

/** Why a Work Statement can't go into a (new) weekly batch — a statement
 *  belongs to at most one active batch, so it can never be double-paid. */
export function batchExclusionReason(
  ws: TechWorkStatement,
  ctx: { batches: WeeklyTechStatement[]; technicians: Agent[]; currentBatchId?: string | null }
): string | null {
  const eligible = isPayoutEligible(ws);
  if (!eligible.ok) return eligible.reason;
  if (!ctx.technicians.some((t) => t.id === ws.technicianId)) return "Missing technician";
  if (!ws.ratePlanId && !ws.rateSnapshot && ws.baseLaborRate <= 0) return "Missing rate plan — no rate resolved";
  const other = ctx.batches.find((b) => b.id !== ctx.currentBatchId && b.status !== "cancelled" && b.statementIds.includes(ws.id));
  if (other) return `Already included in ${other.number}`;
  if (ws.includedInWeeklyBatchId && ws.includedInWeeklyBatchId !== ctx.currentBatchId) {
    const b = ctx.batches.find((x) => x.id === ws.includedInWeeklyBatchId);
    if (b && b.status !== "cancelled") return `Already included in ${b.number}`;
  }
  const mine = ctx.batches.find((b) => b.id === ws.includedInWeeklyBatchId);
  if (mine?.status === "correction_requested") return "Correction requested on its weekly statement";
  return null;
}

// ---------- Company Payables (report only — no persisted table) ----------
export type PayablesSummaryRow = {
  technicianId: string; technicianName: string; jobs: number;
  base: number; extras: number; reimbursements: number; deductions: number; total: number;
};

export function buildPayablesSummary(
  technicians: Agent[], statements: TechWorkStatement[], jobs: Job[], weekStart: string, weekEnd: string
): { rows: PayablesSummaryRow[]; totalJobs: number; totalPayable: number } {
  const inWeek = statements.filter((ws) => {
    if (ws.status !== "approved") return false;
    const job = jobs.find((j) => j.id === ws.jobId);
    const d = job?.date ?? "";
    return d >= weekStart && d <= weekEnd;
  });
  const rows: PayablesSummaryRow[] = technicians
    .map((t) => {
      const mine = inWeek.filter((ws) => ws.technicianId === t.id);
      const totals = sumTotals(mine.map(calcWorkStatement));
      return {
        technicianId: t.id,
        technicianName: t.companyName?.trim() ? `${t.companyName.trim()} — ${t.name}` : t.name,
        jobs: mine.length,
        ...totals,
      };
    })
    .filter((r) => r.jobs > 0);
  return { rows, totalJobs: rows.reduce((a, r) => a + r.jobs, 0), totalPayable: rows.reduce((a, r) => a + r.total, 0) };
}

// ---------- Payroll Register & Export (W-2 only) ----------
export const PAYROLL_DISCLAIMER =
  "Transpare prepares payroll information for review and export. Final withholding, filing and payroll processing must be completed through an authorized payroll provider or qualified professional.";

export type WithholdingRate = { id: string; label: string; percent: number; active: boolean };
export const DEFAULT_WITHHOLDINGS: WithholdingRate[] = [
  { id: "federal", label: "Federal income tax", percent: 0.1, active: true },
  { id: "state", label: "State income tax", percent: 0.04, active: true },
  { id: "ss", label: "Social Security", percent: 0.062, active: true },
  { id: "medicare", label: "Medicare", percent: 0.0145, active: true },
];

export type PayrollStatus = "draft" | "approved" | "paid";
export type PayrollWithholdingLine = { id: string; label: string; percent: number; amount: number; manual: boolean };

export type PayrollLine = {
  id: string;
  technicianId: string;
  technicianName: string;
  classification: string;
  is1099: boolean;
  jobIds: string[];
  statementIds: string[];
  weeklyStatementIds: string[];
  jobs: number;
  regularHours: number;
  overtimeHours: number;
  hourlyRate: number;
  overtimeMultiplier: number;
  laborPay: number;
  reimbursements: number;
  deductions: number;
  withholdings: PayrollWithholdingLine[];
  customerInvoiced: number; // reference only, never added to pay
  note: string;
};

export type PayrollRun = {
  id: string;
  number: string; // "PR-000001"
  periodStart: string;
  periodEnd: string;
  payDate: string;
  frequency: "weekly" | "biweekly";
  status: PayrollStatus;
  lines: PayrollLine[];
  approval: { by: string; at: string; note: string } | null;
  paidAt: string | null;
  audit: DocEvent[];
  pdfHistory: DocPdfRecord[];
  createdAt: string;
  updatedAt: string;
};

export function withholdingsFor(rates: WithholdingRate[], taxableWages: number): PayrollWithholdingLine[] {
  return rates.filter((r) => r.active).map((r) => ({
    id: r.id, label: r.label, percent: r.percent,
    amount: Math.max(0, taxableWages * r.percent), manual: false,
  }));
}

/** Net pay — withholdings only apply to W-2 lines; a 1099 line is paid gross
 *  (and, per the payroll-provider export, isn't even part of that export —
 *  contractors are paid through contractor payables, not payroll). */
export function payrollLineNet(l: PayrollLine): number {
  const gross = l.laborPay + l.reimbursements - l.deductions;
  const withheld = l.withholdings.reduce((s, w) => s + w.amount, 0);
  return gross - (l.is1099 ? 0 : withheld);
}

// ---------- Tax Filing (Form 1099-NEC) ----------
export type Tech1099Line = { date: string; doc: string; jobs: number; base: number; extras: number; reimbursements: number; deductions: number; total: number };

export type Form1099Row = {
  id: string;
  technicianName: string;
  classification: string;
  is1099: boolean;
  customerInvoiced: number;
  lines: Tech1099Line[];
  total: number; // Box 1
  address: string;
  tinLast4: string;
  federalWithheld: number; // Box 4
  stateWithheld: number; // Box 5
  stateName: string;
  accountNumber: string;
};

/** Box 1 (cash-basis) comes from Weekly Statements paid in `year` — never
 *  from Payroll Runs, which is a separate W-2 pipeline. Box 4/5 come from
 *  paid Payroll Runs, summing withholding lines whose label matches
 *  /federal/i or /state/i — so a custom withholding rate's name matters:
 *  rename it away from those words and it silently stops feeding the 1099. */
export function compute1099Rows(
  year: string,
  technicians: Agent[],
  weeklyStatements: WeeklyTechStatement[],
  workStatements: TechWorkStatement[],
  customerInvoices: CustomerInvoice[],
  payrollRuns: PayrollRun[]
): Form1099Row[] {
  const out: Form1099Row[] = [];
  for (const t of technicians) {
    const paid = weeklyStatements.filter((w) => w.technicianId === t.id && w.status === "paid" && (w.paidAt ?? "").startsWith(year));
    if (!paid.length) continue;
    const lines: Tech1099Line[] = paid.map((w) => ({
      date: (w.paidAt ?? "").slice(0, 10), doc: w.number, jobs: w.statementIds.length,
      base: w.totals.base, extras: w.totals.extras, reimbursements: w.totals.reimbursements,
      deductions: w.totals.deductions, total: w.totals.total,
    }));
    const jobIds = new Set(
      paid.flatMap((w) => w.statementIds)
        .map((id) => workStatements.find((ws) => ws.id === id)?.jobId)
        .filter((x): x is string => !!x)
    );
    const customerInvoiced = customerInvoices
      .filter((ci) => ci.jobId && jobIds.has(ci.jobId))
      .reduce((a, ci) => a + customerInvoiceTotals(ci).total, 0);

    const payrollLines = payrollRuns
      .filter((r) => r.status === "paid" && (r.payDate ?? "").startsWith(year))
      .flatMap((r) => r.lines.filter((l) => l.technicianId === t.id));
    const withheldFor = (re: RegExp) =>
      payrollLines.reduce((a, l) => a + l.withholdings.filter((w) => re.test(w.label)).reduce((x, w) => x + w.amount, 0), 0);

    out.push({
      id: t.id,
      technicianName: t.companyName?.trim() ? `${t.companyName.trim()} (Attn: ${t.name})` : t.name,
      classification: t.classification ?? "",
      is1099: resolvePaymentTreatment(t) !== "payroll",
      customerInvoiced,
      lines: lines.sort((a, b) => (a.date < b.date ? -1 : 1)),
      total: lines.reduce((a, l) => a + l.total, 0),
      address: "",
      tinLast4: "",
      federalWithheld: withheldFor(/federal/i),
      stateWithheld: withheldFor(/state/i),
      stateName: t.state || "",
      accountNumber: t.id.slice(0, 8).toUpperCase(),
    });
  }
  return out.sort((a, b) => b.total - a.total);
}

export type RequestStatus =
  | "submitted"
  | "under_review"
  | "needs_info"
  | "approved"
  | "rejected"
  | "resolved";

export type RequestKind = "correction" | "dispute" | "adjustment";
export type RequestPriority = "low" | "normal" | "high";

export type RequestEvent = {
  at: string;
  actor: "rep" | "admin" | "system";
  type:
    | "submitted"
    | "claimed"
    | "needs_info"
    | "rep_reply"
    | "approved"
    | "rejected"
    | "resolved"
    | "note"
    | "reopened";
  message: string;
};

export type RequestedChange = {
  field: string;
  fromValue: string;
  toValue: string;
};

export type Dispute = {
  id: string;
  invoiceId: string;
  agentId: string;
  reason: string;
  notes: string;
  kind: RequestKind;
  priority: RequestPriority;
  status: RequestStatus;
  assignedAdminId: string | null;
  adminNotes: string;
  requestedChange: RequestedChange | null;
  events: RequestEvent[];
  createdAt: string;
  resolvedAt: string | null;
  attachmentUrl?: string;
};

export type IndustryTemplate = {
  id: string;
  name: string;
  description: string;
  emoji?: string;
  charges: LineItem[];
  finance: Omit<FinanceCompany, "id" | "active"> | null;
  tiers: PersonalTier[];
  overrides: OverrideLevel[];
  taxReservePercent: number;
};

export type Role = "admin" | "rep" | "accountant" | "technician";
export type Lang = "es" | "en";

export type NotificationKind =
  | "dispute_submitted"
  | "dispute_replied"
  | "dispute_status"
  | "dispute_claimed"
  | "split_changed"
  | "pdf_regenerated"
  | "info";

export type Notification = {
  id: string;
  at: string;
  kind: NotificationKind;
  title: string;
  message: string;
  audience: "admin" | { agentId: string };
  invoiceId?: string;
  disputeId?: string;
  read: boolean;
};

export type AdjustmentKind =
  | "advance"
  | "deduction"
  | "credit"
  | "chargeback"
  | "manual_override"
  | "payment_correction"
  | "split_correction"
  | "pending_balance";

export type Adjustment = {
  id: string;
  agentId: string;
  invoiceId: string | null;
  kind: AdjustmentKind;
  amount: number; // positive number; sign interpreted from kind
  date: string;
  note: string;
  createdBy: string;
  createdAt: string;
};

type State = {
  company: Company;
  agents: Agent[];
  financeCompanies: FinanceCompany[];
  invoices: Invoice[];
  personalTiers: PersonalTier[];
  overrides: OverrideLevel[];
  positions: CompensationPosition[];
  addPosition: (p: Omit<CompensationPosition, "id">) => string;
  updatePosition: (id: string, p: Partial<CompensationPosition>) => void;
  removePosition: (id: string) => void;
  setPositions: (p: CompensationPosition[]) => void;
  products: Product[];
  addProduct: (p: Omit<Product, "id">) => string;
  updateProduct: (id: string, p: Partial<Product>) => void;
  removeProduct: (id: string) => void;
  setProducts: (p: Product[]) => void;
  invoiceDate: string;
  periodLabel: string;
  nextPayoutDate: string;
  payments: Payment[];
  disputes: Dispute[];
  adjustments: Adjustment[];
  addAdjustment: (a: Omit<Adjustment, "id" | "createdAt">) => void;
  removeAdjustment: (id: string) => void;
  importInvoices: (rows: Omit<Invoice, "id" | "number">[]) => number;
  taxReserveByState: Record<string, number>;
  language: Lang;
  setLanguage: (l: Lang) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  dashboardWidgets: string[];
  setDashboardWidgets: (order: string[]) => void;
  setTaxReserveByState: (m: Record<string, number>) => void;

  role: Role;
  activeAgentId: string | null;
  setRole: (r: Role) => void;
  setActiveAgentId: (id: string | null) => void;

  setCompany: (c: Partial<Company>) => void;

  addAgent: (a: Omit<Agent, "id">) => void;
  updateAgent: (id: string, a: Partial<Agent>) => void;
  removeAgent: (id: string) => void;
  setAgents: (a: Agent[]) => void;

  addFinanceCo: (f: Omit<FinanceCompany, "id">) => string;
  updateFinanceCo: (id: string, f: Partial<FinanceCompany>) => void;
  removeFinanceCo: (id: string) => void;

  addInvoice: (i: Omit<Invoice, "id" | "number">) => string;
  updateInvoice: (id: string, i: Partial<Invoice>) => void;
  removeInvoice: (id: string) => void;

  // In-progress "New/Edit invoice" form — kept here (not component state) so
  // switching tabs, or reloading the page, doesn't wipe out unsaved work.
  invoiceDraft: Omit<Invoice, "id" | "number"> | null;
  invoiceDraftEditingId: string | null;
  invoiceDraftProductId: string;
  setInvoiceDraft: (d: Omit<Invoice, "id" | "number"> | null) => void;
  setInvoiceDraftEditingId: (id: string | null) => void;
  setInvoiceDraftProductId: (id: string) => void;

  addPayment: (p: Omit<Payment, "id">) => void;
  updatePayment: (id: string, patch: Partial<Payment>) => void;
  removePayment: (id: string) => void;

  payoutDocuments: PayoutDocument[];
  generatePayoutDocuments: (
    invoiceId: string,
    rows: { name: string; role: string; amount: number; agentId: string | null }[]
  ) => void;
  approvePayoutDocument: (id: string) => void;
  rejectPayoutDocument: (id: string, reason: string) => void;
  schedulePayoutDocument: (id: string, date: string) => void;
  markPayoutDocumentPaid: (id: string) => void;
  recordPayoutDocumentDelivery: (id: string) => void;
  regeneratePayoutDocument: (id: string, by: string) => void;

  // ---- Jobs ----
  jobs: Job[];
  addJob: (j: Omit<Job, "id" | "number" | "createdAt" | "updatedAt">) => string;
  updateJob: (id: string, patch: Partial<Job>) => void;
  removeJob: (id: string) => void;

  // ---- Rate Plans ----
  techRatePlans: TechRatePlan[];
  addRatePlan: (p: Omit<TechRatePlan, "id" | "createdAt" | "updatedAt">) => string;
  updateRatePlan: (id: string, patch: Partial<TechRatePlan>) => void;
  removeRatePlan: (id: string) => void;

  // ---- Customer Invoices (jobId-based) ----
  customerInvoices: CustomerInvoice[];
  createCustomerInvoice: (jobId: string | null) => string;
  updateCustomerInvoice: (id: string, patch: Partial<CustomerInvoice>) => void;
  setCustomerInvoiceStatus: (id: string, status: CustomerInvoiceStatus) => void;
  recordCustomerInvoicePayment: (id: string, payment: Omit<CustomerInvoicePayment, "id">) => void;
  removeCustomerInvoice: (id: string) => void;

  // ---- Work Statements ----
  workStatements: TechWorkStatement[];
  /** Returns the new statement's id, OR (when a matching active statement
   *  already exists and statementType wasn't explicitly overridden) the
   *  existing duplicate so the UI can offer the DuplicateStatementDialog
   *  instead of silently creating a second original. */
  createWorkStatement: (jobId: string, opts?: { statementType?: StatementType; typeReason?: string; relatedStatementId?: string }) =>
    { id: string | null; duplicateOf: TechWorkStatement | null };
  updateWorkStatement: (id: string, patch: Partial<TechWorkStatement>) => void;
  submitWorkStatement: (id: string, by: string) => void;
  approveWorkStatement: (id: string, by: string, note?: string) => void;
  rejectWorkStatement: (id: string, by: string, reason: string) => void;
  addWorkStatementAttachment: (id: string, attachment: StatementAttachment) => void;
  removeWorkStatement: (id: string) => void;

  // ---- Weekly Statements ----
  weeklyStatements: WeeklyTechStatement[];
  buildWeeklyStatement: (technicianId: string, weekStart: string, weekEnd: string, by: string) =>
    { id: string | null; included: number; skipped: { number: string; reason: string }[] };
  approveWeeklyStatement: (id: string, by: string, note?: string) => void;
  markWeeklyStatementPaid: (id: string, payment: { amount: number; method: string; note: string }) => void;
  requestWeeklyStatementCorrection: (id: string, by: string, reason: string) => void;
  removeWeeklyStatement: (id: string) => void;

  // ---- Payroll Register & Export (W-2) ----
  // withholdingRates lives on Company (see setCompany); allowMultipleOriginalStatements too.
  payrollRuns: PayrollRun[];
  buildPayrollRun: (periodStart: string, periodEnd: string, payDate: string, frequency: "weekly" | "biweekly") => string;
  updatePayrollLine: (runId: string, lineId: string, patch: Partial<PayrollLine>) => void;
  approvePayrollRun: (id: string, by: string) => void;
  markPayrollRunPaid: (id: string) => void;
  removePayrollRun: (id: string) => void;

  // Masked tax IDs — see AgentTaxId. Populated only for admin/accountant
  // (RLS-restricted); empty for every other role, by design.
  agentTaxIds: AgentTaxId[];
  setAgentTaxIdLast4: (agentId: string, last4: string) => void;

  addDispute: (
    d: Omit<
      Dispute,
      | "id"
      | "createdAt"
      | "resolvedAt"
      | "status"
      | "adminNotes"
      | "events"
      | "assignedAdminId"
      | "kind"
      | "priority"
      | "requestedChange"
      | "notes"
    > &
      Partial<Pick<Dispute, "kind" | "priority" | "requestedChange" | "notes">>
  ) => void;
  updateDispute: (id: string, d: Partial<Dispute>) => void;
  removeDispute: (id: string) => void;
  claimRequest: (id: string, adminId: string | null) => void;
  setRequestStatus: (
    id: string,
    status: RequestStatus,
    actor: "rep" | "admin" | "system",
    message?: string
  ) => void;
  appendRequestEvent: (id: string, ev: Omit<RequestEvent, "at">) => void;
  replyToRequest: (id: string, actor: "rep" | "admin", message: string) => void;

  applyTemplate: (t: IndustryTemplate) => void;

  setPersonalTiers: (t: PersonalTier[]) => void;
  setOverrides: (o: OverrideLevel[]) => void;
  setInvoiceMeta: (date: string, period: string) => void;
  setNextPayoutDate: (d: string) => void;
  resetAll: () => void;
  loadDemoData: () => void;

  splitTemplates: SplitTemplate[];
  splitRules: SplitRule[];
  addSplitTemplate: (t: Omit<SplitTemplate, "id">) => string;
  updateSplitTemplate: (id: string, t: Partial<SplitTemplate>) => void;
  removeSplitTemplate: (id: string) => void;
  addSplitRule: (r: Omit<SplitRule, "id">) => string;
  updateSplitRule: (id: string, r: Partial<SplitRule>) => void;
  removeSplitRule: (id: string) => void;
  setInvoiceSplit: (
    invoiceId: string,
    split: InvoiceSplit | null,
    audit: { by: string; action: SplitAuditEntry["action"]; message: string }
  ) => void;
  applySplitTemplate: (invoiceId: string, templateId: string, by: string) => void;
  applySplitRules: (invoiceId: string, by: string) => string | null;
  appendInvoicePdfRecord: (invoiceId: string, record: InvoicePdfRecord) => void;

  currentUserName: string;
  setCurrentUserName: (n: string) => void;

  notifications: Notification[];
  addNotification: (n: Omit<Notification, "id" | "at" | "read">) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: (audience: "admin" | { agentId: string }) => void;
  clearNotifications: (audience: "admin" | { agentId: string }) => void;
  removeNotification: (id: string) => void;
  removeNotifications: (ids: string[]) => void;
  restoreNotifications: (notifs: Notification[]) => void;

  deepLink: {
    ts: number;
    tab?: string;
    invoiceId?: string;
    disputeId?: string;
    customerInvoiceId?: string;
    workStatementId?: string;
    openTimeline?: boolean;
    openSplit?: boolean;
    openDispute?: boolean;
    openEdit?: boolean;
    openCustomerInvoice?: boolean;
    openWorkStatement?: boolean;
  } | null;
  setDeepLink: (d: State["deepLink"]) => void;

  wizard: { currentStep: number; completedSteps: number[]; completed: boolean };
  setWizardStep: (n: number) => void;
  markWizardStepDone: (n: number) => void;
  completeWizard: () => void;
  resetWizard: () => void;
};

const uid = () => crypto.randomUUID();

function sameAudience(
  a: Notification["audience"],
  b: Notification["audience"]
): boolean {
  if (a === "admin") return b === "admin";
  if (b === "admin") return false;
  return a.agentId === b.agentId;
}

const defaults = {
  company: {
    name: "",
    address: "",
    email: "",
    phone: "",
    taxId: "",
    currency: "USD",
    invoicePrefix: "INV",
    brandColor: "#0B1F3A",
    logoDataUrl: "",
    brandColorSecondary: "#2563EB",
    footerText: "Thank you for your business.",
    disclaimerText:
      "All amounts are subject to verification. Tax reserves are suggestions, not official tax advice.",
    invoiceTemplate: "classic",
    commissionEntryMode: "fixed",
    technicianTermSingular: "",
    technicianTermPlural: "",
    allowMultipleOriginalStatements: false,
    withholdingRates: DEFAULT_WITHHOLDINGS,
  } as Company,
  personalTiers: [
    { minVolume: 0, rate: 0.05 },
    { minVolume: 5000, rate: 0.08 },
    { minVolume: 20000, rate: 0.12 },
  ] as PersonalTier[],
  overrides: [
    { level: 1, rate: 0.05 },
    { level: 2, rate: 0.02 },
    { level: 3, rate: 0.01 },
  ] as OverrideLevel[],
};

function defaultSplitTemplates(): SplitTemplate[] {
  return [
    {
      id: "tpl_50_50",
      name: "50 / 50 split",
      description: "Even split between two reps.",
      positions: [
        { role: "sales_rep", splitPercent: 0.5 },
        { role: "sales_rep", splitPercent: 0.5 },
      ],
    },
    {
      id: "tpl_60_40",
      name: "60 / 40 split",
      description: "Primary rep 60%, partner 40%.",
      positions: [
        { role: "sales_rep", splitPercent: 0.6 },
        { role: "partner", splitPercent: 0.4 },
      ],
    },
    {
      id: "tpl_70_30_closer_setter",
      name: "70 / 30 Closer / Setter",
      description: "Closer takes 70%, Setter 30%.",
      positions: [
        { role: "closer", splitPercent: 0.7 },
        { role: "setter", splitPercent: 0.3 },
      ],
    },
    {
      id: "tpl_100_primary",
      name: "100% Primary Rep",
      description: "Single rep keeps the full commission pool.",
      positions: [{ role: "sales_rep", splitPercent: 1 }],
    },
  ];
}

const seqFor = (prefix: string, list: Invoice[]) => {
  // Based on the highest existing sequence, not the count — counting breaks
  // as soon as any invoice in the range has been deleted, since the next
  // "count + 1" number can collide with one still in the database (the
  // company_id+number unique constraint then rejects the upsert silently).
  const nums = list
    .filter((i) => i.number?.startsWith(`${prefix}-`))
    .map((i) => parseInt(i.number.slice(prefix.length + 1), 10))
    .filter((n) => Number.isFinite(n));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}-${String(n).padStart(5, "0")}`;
};

const todayPlus = (d: number) => {
  const x = new Date();
  x.setDate(x.getDate() + d);
  return x.toISOString().slice(0, 10);
};

// Annotated explicitly (rather than left to inference through create<State>()(persist(...)))
// because this object literal is large enough that TypeScript silently gives up
// contextually typing it past a certain point, leaving everything after that point
// an implicit `any` — an explicit StateCreator<State> annotation forces it to type
// the whole thing directly instead.
const storeCreator: StateCreator<State> = (set, get) => ({
      ...defaults,
      agents: [],
      financeCompanies: [],
      invoices: [],
      payments: [],
      disputes: [],
      adjustments: [],
      positions: [],
      splitTemplates: defaultSplitTemplates(),
      splitRules: [],
      addSplitTemplate: (t) => {
        const id = uid();
        set((s) => ({ splitTemplates: [...s.splitTemplates, { ...t, id }] }));
        return id;
      },
      updateSplitTemplate: (id, t) =>
        set((s) => ({
          splitTemplates: s.splitTemplates.map((x) => (x.id === id ? { ...x, ...t } : x)),
        })),
      removeSplitTemplate: (id) =>
        set((s) => ({ splitTemplates: s.splitTemplates.filter((x) => x.id !== id) })),
      addSplitRule: (r) => {
        const id = uid();
        set((s) => ({ splitRules: [...s.splitRules, { ...r, id }] }));
        return id;
      },
      updateSplitRule: (id, r) =>
        set((s) => ({
          splitRules: s.splitRules.map((x) => (x.id === id ? { ...x, ...r } : x)),
        })),
      removeSplitRule: (id) =>
        set((s) => ({ splitRules: s.splitRules.filter((x) => x.id !== id) })),
      setInvoiceSplit: (invoiceId, split, audit) =>
        set((s) => ({
          invoices: s.invoices.map((inv) => {
            if (inv.id !== invoiceId) return inv;
            const prevHistory = inv.split?.history ?? [];
            if (!split) {
              return {
                ...inv,
                split: null,
                brandingSnapshot: undefined, // force PDF regeneration
              };
            }
            const entry: SplitAuditEntry = {
              at: new Date().toISOString(),
              by: audit.by,
              action: audit.action,
              message: audit.message,
              snapshot: split.participants,
            };
            return {
              ...inv,
              split: { ...split, history: [...prevHistory, entry] },
              // invalidate snapshot so next PDF reflects new split
              brandingSnapshot: undefined,
            };
          }),
        })),
      applySplitTemplate: (invoiceId, templateId, by) => {
        const tpl = get().splitTemplates.find((x) => x.id === templateId);
        if (!tpl) return;
        const inv = get().invoices.find((i) => i.id === invoiceId);
        if (!inv) return;
        const primaryAgent = get().agents.find((a) => a.id === inv.agentId);
        const participants: SplitParticipant[] = tpl.positions.map((p, idx) => ({
          id: uid(),
          agentId: idx === 0 ? inv.agentId : null,
          displayName: idx === 0 ? primaryAgent?.name ?? "Primary rep" : p.displayName ?? "",
          role: p.role,
          customRoleLabel: p.customRoleLabel,
          splitPercent: p.splitPercent,
          commissionLevel: idx === 0 ? primaryAgent?.level : undefined,
        }));
        const split: InvoiceSplit = {
          participants,
          appliedRuleId: null,
          appliedTemplateId: tpl.id,
          approvedAt: null,
          approvedBy: null,
          history: inv.split?.history ?? [],
        };
        get().setInvoiceSplit(invoiceId, split, {
          by,
          action: "template_applied",
          message: `Applied template: ${tpl.name}`,
        });
      },
      applySplitRules: (invoiceId, by) => {
        const inv = get().invoices.find((i) => i.id === invoiceId);
        if (!inv) return null;
        const agent = get().agents.find((a) => a.id === inv.agentId);
        const rules = get().splitRules
          .filter((r) => r.active)
          .sort((a, b) => b.priority - a.priority);
        const matched = rules.find((r) => {
          const c = r.criteria;
          if (c.financeCompanyId && inv.financeCompanyId !== c.financeCompanyId) return false;
          if (c.repLevel && agent?.level !== c.repLevel) return false;
          if (c.commissionLevel && inv.commissionLevel !== c.commissionLevel) return false;
          if (c.managerAgentId && agent?.sponsorId !== c.managerAgentId) return false;
          if (c.dealType && inv.saleType !== c.dealType) return false;
          return true;
        });
        if (!matched) return null;
        const tpl = get().splitTemplates.find((x) => x.id === matched.templateId);
        if (!tpl) return null;
        const primaryAgent = agent ?? null;
        const participants: SplitParticipant[] = tpl.positions.map((p, idx) => ({
          id: uid(),
          agentId: idx === 0 ? inv.agentId : null,
          displayName: idx === 0 ? primaryAgent?.name ?? "Primary rep" : p.displayName ?? "",
          role: p.role,
          customRoleLabel: p.customRoleLabel,
          splitPercent: p.splitPercent,
          commissionLevel: idx === 0 ? primaryAgent?.level : undefined,
        }));
        const split: InvoiceSplit = {
          participants,
          appliedRuleId: matched.id,
          appliedTemplateId: tpl.id,
          approvedAt: null,
          approvedBy: null,
          history: inv.split?.history ?? [],
        };
        get().setInvoiceSplit(invoiceId, split, {
          by,
          action: "rule_applied",
          message: `Rule "${matched.name}" matched → template "${tpl.name}"`,
        });
        return matched.id;
      },
      appendInvoicePdfRecord: (invoiceId, record) =>
        set((s) => ({
          invoices: s.invoices.map((inv) =>
            inv.id === invoiceId
              ? { ...inv, pdfHistory: [...(inv.pdfHistory ?? []), record] }
              : inv
          ),
        })),

      currentUserName: "Admin",
      setCurrentUserName: (currentUserName) => set({ currentUserName }),

      deepLink: null,
      setDeepLink: (deepLink) => set({ deepLink }),

      wizard: { currentStep: 0, completedSteps: [], completed: false },
      setWizardStep: (n) =>
        set((s) => ({ wizard: { ...s.wizard, currentStep: n } })),
      markWizardStepDone: (n) =>
        set((s) => ({
          wizard: {
            ...s.wizard,
            completedSteps: Array.from(new Set([...s.wizard.completedSteps, n])),
          },
        })),
      completeWizard: () =>
        set((s) => ({ wizard: { ...s.wizard, completed: true } })),
      resetWizard: () =>
        set({ wizard: { currentStep: 0, completedSteps: [], completed: false } }),




      notifications: [],
      addNotification: (n) =>
        set((s) => ({
          notifications: [
            ...s.notifications,
            { ...n, id: uid(), at: new Date().toISOString(), read: false },
          ],
        })),
      markNotificationRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((x) =>
            x.id === id ? { ...x, read: true } : x
          ),
        })),
      markAllNotificationsRead: (audience) =>
        set((s) => ({
          notifications: s.notifications.map((x) =>
            sameAudience(x.audience, audience) ? { ...x, read: true } : x
          ),
        })),
      clearNotifications: (audience) =>
        set((s) => ({
          notifications: s.notifications.filter(
            (x) => !sameAudience(x.audience, audience)
          ),
        })),
      removeNotification: (id) =>
        set((s) => ({ notifications: s.notifications.filter((x) => x.id !== id) })),
      removeNotifications: (ids) => {
        const set2 = new Set(ids);
        set((s) => ({ notifications: s.notifications.filter((x) => !set2.has(x.id)) }));
      },
      restoreNotifications: (notifs) =>
        set((s) => {
          const existing = new Set(s.notifications.map((n) => n.id));
          const toAdd = notifs.filter((n) => !existing.has(n.id));
          return { notifications: [...s.notifications, ...toAdd] };
        }),
      addPosition: (p) => {
        const id = uid();
        set((s) => ({ positions: [...s.positions, { ...p, id }] }));
        return id;
      },
      updatePosition: (id, p) =>
        set((s) => ({ positions: s.positions.map((x) => (x.id === id ? { ...x, ...p } : x)) })),
      removePosition: (id) =>
        set((s) => ({ positions: s.positions.filter((x) => x.id !== id) })),
      setPositions: (positions) => set({ positions }),
      products: [],
      addProduct: (p) => {
        const id = uid();
        set((s) => ({ products: [...s.products, { ...p, id }] }));
        return id;
      },
      updateProduct: (id, p) =>
        set((s) => ({ products: s.products.map((x) => (x.id === id ? { ...x, ...p } : x)) })),
      removeProduct: (id) =>
        set((s) => ({ products: s.products.filter((x) => x.id !== id) })),
      setProducts: (products) => set({ products }),
      addAdjustment: (a) =>
        set((s) => ({
          adjustments: [
            ...s.adjustments,
            { ...a, id: uid(), createdAt: new Date().toISOString() },
          ],
        })),
      removeAdjustment: (id) =>
        set((s) => ({ adjustments: s.adjustments.filter((x) => x.id !== id) })),
      importInvoices: (rows) => {
        let added = 0;
        set((s) => {
          const next = [...s.invoices];
          for (const r of rows) {
            const number = seqFor(s.company.invoicePrefix, next);
            next.push({ ...r, id: uid(), number });
            added++;
          }
          return { invoices: next };
        });
        return added;
      },
      invoiceDate: new Date().toISOString().slice(0, 10),
      periodLabel: new Date().toLocaleString("en-US", { month: "long", year: "numeric" }),
      nextPayoutDate: todayPlus(14),
      taxReserveByState: {},
      language: "es" as Lang,
      setLanguage: (language) => set({ language }),
      theme: "light" as "light" | "dark",
      toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
      dashboardWidgets: ["kpis", "top_reps", "recent_invoices"],
      setDashboardWidgets: (dashboardWidgets) => set({ dashboardWidgets }),
      setTaxReserveByState: (taxReserveByState) => set({ taxReserveByState }),

      role: "admin" as Role,
      activeAgentId: null,
      setRole: (role) => set({ role }),
      setActiveAgentId: (activeAgentId) => set({ activeAgentId }),

      setCompany: (c) => set((s) => ({ company: { ...s.company, ...c } })),

      addAgent: (a) => set((s) => ({ agents: [...s.agents, { ...a, id: uid() }] })),
      updateAgent: (id, a) =>
        set((s) => {
          const prev = s.agents.find((x) => x.id === id);
          const newNotifs: Notification[] = [];
          if (prev && a.w9Status && a.w9Status !== prev.w9Status && a.w9Status === "valid") {
            newNotifs.push({
              id: uid(), at: new Date().toISOString(), read: false,
              title: `W-9 completado`,
              message: `${prev.name} entregó su W-9 y está verificado.`,
              kind: "info", audience: "admin",
            });
          }
          return {
            agents: s.agents.map((x) => (x.id === id ? { ...x, ...a } : x)),
            notifications: [...s.notifications, ...newNotifs],
          };
        }),
      removeAgent: (id) =>
        set((s) => ({
          agents: s.agents.filter((x) => x.id !== id).map((x) =>
            x.sponsorId === id ? { ...x, sponsorId: null } : x
          ),
          invoices: s.invoices.filter((x) => x.agentId !== id),
          payments: s.payments.filter((x) => x.agentId !== id),
          disputes: s.disputes.filter((x) => x.agentId !== id),
          adjustments: s.adjustments.filter((x) => x.agentId !== id),
        })),
      setAgents: (agents) => set({ agents }),

      addFinanceCo: (f) => {
        const id = uid();
        set((s) => ({
          financeCompanies: [...s.financeCompanies, { ...f, id }],
          notifications: [...s.notifications, {
            id: uid(), at: new Date().toISOString(), read: false,
            title: "Nueva empresa financiera",
            message: `${f.name} fue agregada como opción de financiamiento.`,
            kind: "info" as const, audience: "admin" as const,
          }],
        }));
        return id;
      },
      updateFinanceCo: (id, f) =>
        set((s) => ({
          financeCompanies: s.financeCompanies.map((x) => (x.id === id ? { ...x, ...f } : x)),
        })),
      removeFinanceCo: (id) =>
        set((s) => ({ financeCompanies: s.financeCompanies.filter((x) => x.id !== id) })),

      addInvoice: (i) => {
        const id = uid();
        const number = seqFor(get().company.invoicePrefix, get().invoices);
        set((s) => ({ invoices: [...s.invoices, { ...i, id, number }] }));
        return id;
      },
      updateInvoice: (id, i) =>
        set((s) => ({
          invoices: s.invoices.map((x) => (x.id === id ? { ...x, ...i } : x)),
        })),
      removeInvoice: (id) =>
        set((s) => ({
          invoices: s.invoices.filter((x) => x.id !== id),
          disputes: s.disputes.filter((x) => x.invoiceId !== id),
          adjustments: s.adjustments.filter((x) => x.invoiceId !== id),
        })),

      invoiceDraft: null,
      invoiceDraftEditingId: null,
      invoiceDraftProductId: "",
      setInvoiceDraft: (invoiceDraft) => set({ invoiceDraft }),
      setInvoiceDraftEditingId: (invoiceDraftEditingId) => set({ invoiceDraftEditingId }),
      setInvoiceDraftProductId: (invoiceDraftProductId) => set({ invoiceDraftProductId }),

      addPayment: (p) => set((s) => {
        const agentName = s.agents.find((a) => a.id === p.agentId)?.name ?? "Un rep";
        return {
          payments: [...s.payments, { ...p, id: uid() }],
          notifications: [...s.notifications, {
            id: uid(), at: new Date().toISOString(), read: false,
            title: "Pago programado",
            message: `Se programó un pago de ${
              typeof p.amount === "number"
                ? "$" + p.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : p.amount
            } para ${agentName}.`,
            kind: "info" as const, audience: "admin" as const,
          }],
        };
      }),
      updatePayment: (id, patch) => set((s) => ({
        payments: s.payments.map((x) => (x.id === id ? { ...x, ...patch } : x)),
      })),
      removePayment: (id) => set((s) => ({ payments: s.payments.filter((x) => x.id !== id) })),

      payoutDocuments: [],
      generatePayoutDocuments: (invoiceId, rows) => set((s) => {
        let docs = [...s.payoutDocuments];
        let seq = docs.length;
        for (const row of rows) {
          if (!row.agentId) continue;
          const idx = docs.findIndex((d) => d.invoiceId === invoiceId && d.agentId === row.agentId);
          const roleLabel = s.agents.find((a) => a.id === row.agentId)?.level ?? "";
          if (idx >= 0) {
            docs[idx] = {
              ...docs[idx],
              roleLabel,
              description: row.role,
              amount: row.amount,
              updatedAt: new Date().toISOString(),
            };
          } else {
            seq++;
            docs.push({
              id: uid(),
              number: `PD-${String(seq).padStart(6, "0")}`,
              invoiceId,
              agentId: row.agentId,
              roleLabel,
              description: row.role,
              amount: row.amount,
              status: "pending",
              scheduledDate: null,
              rejectedReason: null,
              deliveredAt: null,
              pdfVersions: 0,
              lastPdfAt: null,
              lastPdfBy: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        }
        // Drop documents for recipients no longer involved in this invoice
        // (e.g. the split changed) — but only while still pending, so an
        // already approved/rejected/paid document is never silently lost.
        const currentAgentIds = new Set(rows.map((r) => r.agentId).filter((x): x is string => !!x));
        docs = docs.filter((d) => d.invoiceId !== invoiceId || currentAgentIds.has(d.agentId) || d.status !== "pending");
        return { payoutDocuments: docs };
      }),
      approvePayoutDocument: (id) => set((s) => ({
        payoutDocuments: s.payoutDocuments.map((d) =>
          d.id === id ? { ...d, status: "approved", rejectedReason: null, updatedAt: new Date().toISOString() } : d
        ),
      })),
      rejectPayoutDocument: (id, reason) => set((s) => ({
        payoutDocuments: s.payoutDocuments.map((d) =>
          d.id === id ? { ...d, status: "rejected", rejectedReason: reason, updatedAt: new Date().toISOString() } : d
        ),
      })),
      schedulePayoutDocument: (id, date) => set((s) => ({
        payoutDocuments: s.payoutDocuments.map((d) =>
          d.id === id ? { ...d, scheduledDate: date, updatedAt: new Date().toISOString() } : d
        ),
      })),
      recordPayoutDocumentDelivery: (id) => set((s) => ({
        payoutDocuments: s.payoutDocuments.map((d) =>
          d.id === id ? { ...d, deliveredAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : d
        ),
      })),
      regeneratePayoutDocument: (id, by) => set((s) => ({
        payoutDocuments: s.payoutDocuments.map((d) =>
          d.id === id
            ? { ...d, pdfVersions: d.pdfVersions + 1, lastPdfAt: new Date().toISOString(), lastPdfBy: by, updatedAt: new Date().toISOString() }
            : d
        ),
      })),
      markPayoutDocumentPaid: (id) => set((s) => {
        const doc = s.payoutDocuments.find((d) => d.id === id);
        if (!doc) return {};
        const inv = s.invoices.find((i) => i.id === doc.invoiceId);
        return {
          payoutDocuments: s.payoutDocuments.map((d) =>
            d.id === id ? { ...d, status: "paid", updatedAt: new Date().toISOString() } : d
          ),
          payments: [...s.payments, {
            id: uid(),
            agentId: doc.agentId,
            date: new Date().toISOString().slice(0, 10),
            amount: doc.amount,
            method: "Payout document",
            notes: `${doc.number}${inv ? ` · ${inv.number}` : ""} — ${doc.description}`,
            reference: doc.number,
            status: "paid" as const,
          }],
        };
      }),

      jobs: [],
      addJob: (j) => {
        const id = uid();
        set((s) => {
          const now = new Date().toISOString();
          const seq = s.jobs.length + 1;
          const job: Job = { ...j, id, number: `JOB-${String(seq).padStart(6, "0")}`, createdAt: now, updatedAt: now };
          return { jobs: [...s.jobs, job] };
        });
        return id;
      },
      updateJob: (id, patch) => set((s) => ({
        jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch, updatedAt: new Date().toISOString() } : j)),
      })),
      removeJob: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),

      techRatePlans: [],
      addRatePlan: (p) => {
        const id = uid();
        set((s) => {
          const now = new Date().toISOString();
          const plan: TechRatePlan = { ...p, id, createdAt: now, updatedAt: now };
          return { techRatePlans: [...s.techRatePlans, plan] };
        });
        return id;
      },
      updateRatePlan: (id, patch) => set((s) => ({
        techRatePlans: s.techRatePlans.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)),
      })),
      removeRatePlan: (id) => set((s) => ({ techRatePlans: s.techRatePlans.filter((p) => p.id !== id) })),

      customerInvoices: [],
      createCustomerInvoice: (jobId) => {
        const id = uid();
        set((s) => {
          const job = jobId ? s.jobs.find((j) => j.id === jobId) ?? null : null;
          const seq = s.customerInvoices.length + 1;
          const now = new Date().toISOString();
          const lineItems: CustomerInvoiceLineItem[] = job
            ? [{ id: uid(), productId: null, kind: "product", label: job.productInstalled || "Product/Service", quantity: 1, unitPrice: 0 }]
            : [];
          const doc: CustomerInvoice = {
            id,
            number: `CINV-${String(seq).padStart(6, "0")}`,
            jobId,
            saleInvoiceId: job?.saleInvoiceId ?? null,
            status: "draft",
            customerName: job?.customerName ?? "",
            customerEmail: "",
            billingAddress: job?.billingAddress ?? "",
            billingGeo: null,
            serviceAddress: job?.serviceAddress ?? "",
            serviceGeo: job?.serviceGeo ?? null,
            invoiceDate: now.slice(0, 10),
            dueDate: now.slice(0, 10),
            lineItems,
            discount: 0,
            taxPercent: 0,
            deposit: 0,
            financingApplied: 0,
            paymentTerms: "",
            notes: "",
            warrantyInfo: "",
            attachments: [],
            payments: [],
            history: [{ at: now, actor: s.currentUserName, type: "created", message: "" }],
            pdfHistory: [],
            sentAt: null,
            viewedAt: null,
            createdAt: now,
            updatedAt: now,
          };
          return { customerInvoices: [...s.customerInvoices, doc] };
        });
        return id;
      },
      updateCustomerInvoice: (id, patch) => set((s) => ({
        customerInvoices: s.customerInvoices.map((d) =>
          d.id === id ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d
        ),
      })),
      setCustomerInvoiceStatus: (id, status) => set((s) => ({
        customerInvoices: s.customerInvoices.map((d) =>
          d.id === id
            ? {
                ...d,
                status,
                sentAt: status === "sent" && !d.sentAt ? new Date().toISOString() : d.sentAt,
                viewedAt: status === "viewed" && !d.viewedAt ? new Date().toISOString() : d.viewedAt,
                updatedAt: new Date().toISOString(),
              }
            : d
        ),
      })),
      recordCustomerInvoicePayment: (id, payment) => set((s) => {
        const doc = s.customerInvoices.find((d) => d.id === id);
        if (!doc) return {};
        const nextPayments = [...doc.payments, { ...payment, id: uid() }];
        const { total, paid } = customerInvoiceTotals({ ...doc, payments: nextPayments });
        const nextStatus: CustomerInvoiceStatus =
          paid >= total && total > 0 ? "paid" : paid > 0 ? "partially_paid" : doc.status;
        return {
          customerInvoices: s.customerInvoices.map((d) =>
            d.id === id ? { ...d, payments: nextPayments, status: nextStatus, updatedAt: new Date().toISOString() } : d
          ),
        };
      }),
      removeCustomerInvoice: (id) => set((s) => ({
        customerInvoices: s.customerInvoices.filter((d) => d.id !== id),
      })),

      workStatements: [],
      createWorkStatement: (jobId, opts) => {
        const s0 = get();
        const job = s0.jobs.find((j) => j.id === jobId);
        if (!job || !job.technicianId) return { id: null, duplicateOf: null };
        const tech = s0.agents.find((a) => a.id === job.technicianId);
        const classification = tech?.classification ?? "";
        const statementType = opts?.statementType ?? "original";
        const existing = findActiveStatement(s0.workStatements, {
          jobId, technicianId: job.technicianId, classification, statementType,
        });
        if (existing) return { id: null, duplicateOf: existing };

        const id = uid();
        set((s) => {
          const now = new Date().toISOString();
          const seq = s.workStatements.length + 1;
          const rate = resolveRate(s.techRatePlans, {
            technicianId: job.technicianId!, date: job.date, jobType: job.jobType, product: job.productInstalled, territory: job.territory,
          });
          const rateSnapshot: RateSnapshot | null = rate.plan ? {
            ratePlanId: rate.plan.id, ratePlanName: rate.plan.name, effectiveFrom: rate.plan.effectiveFrom,
            baseRate: rate.baseLaborRate, mileageRate: rate.mileageRate, extraLaborHourlyRate: rate.plan.extraLaborHourlyRate,
            serviceCallRate: rate.plan.serviceCallRate, emergencyRate: rate.plan.emergencyRate,
            reimbursementPercent: rate.plan.materialReimbursementPercent, reimbursementCap: rate.plan.materialReimbursementCap,
            source: rate.source, capturedAt: now,
          } : null;
          const doc: TechWorkStatement = {
            id,
            number: `TWS-${String(seq).padStart(6, "0")}`,
            jobId,
            technicianId: job.technicianId!,
            classification,
            ratePlanId: rate.plan?.id ?? null,
            baseLaborRate: rate.baseLaborRate,
            additionalLabor: 0,
            extraPlumbing: 0,
            mileageMiles: 0,
            mileageRate: rate.mileageRate,
            materialReimbursement: 0,
            deductions: 0,
            chargebacks: 0,
            corrections: 0,
            notes: "",
            attachments: [],
            status: "draft",
            approval: null,
            approvalHistory: [{ at: now, actor: s.currentUserName, type: "created", message: "" }],
            audit: [],
            paymentStatus: "unpaid",
            includedInWeeklyBatchId: null,
            batchStatus: null,
            approvedAt: null,
            paidAt: null,
            isAdjustment: statementType !== "original",
            adjustsStatementId: opts?.relatedStatementId ?? null,
            statementType,
            relatedStatementId: opts?.relatedStatementId ?? null,
            typeReason: opts?.typeReason ?? "",
            rateSnapshot,
            rateOverrides: [],
            pdfHistory: [],
            createdAt: now,
            updatedAt: now,
          };
          return { workStatements: [...s.workStatements, doc] };
        });
        return { id, duplicateOf: null };
      },
      updateWorkStatement: (id, patch) => set((s) => ({
        workStatements: s.workStatements.map((w) => (w.id === id ? { ...w, ...patch, updatedAt: new Date().toISOString() } : w)),
      })),
      submitWorkStatement: (id, by) => set((s) => ({
        workStatements: s.workStatements.map((w) => w.id === id
          ? { ...w, status: "pending_approval", updatedAt: new Date().toISOString(),
              approvalHistory: [...w.approvalHistory, { at: new Date().toISOString(), actor: by, type: "submitted", message: "" }] }
          : w),
      })),
      approveWorkStatement: (id, by, note) => set((s) => ({
        workStatements: s.workStatements.map((w) => w.id === id
          ? { ...w, status: "approved", approvedAt: new Date().toISOString(), approval: { by, at: new Date().toISOString(), note: note ?? "" },
              updatedAt: new Date().toISOString(),
              approvalHistory: [...w.approvalHistory, { at: new Date().toISOString(), actor: by, type: "approved", message: note ?? "" }] }
          : w),
      })),
      rejectWorkStatement: (id, by, reason) => set((s) => ({
        workStatements: s.workStatements.map((w) => w.id === id
          ? { ...w, status: "rejected", updatedAt: new Date().toISOString(),
              approvalHistory: [...w.approvalHistory, { at: new Date().toISOString(), actor: by, type: "rejected", message: reason }] }
          : w),
      })),
      addWorkStatementAttachment: (id, attachment) => set((s) => ({
        workStatements: s.workStatements.map((w) => w.id === id
          ? { ...w, attachments: [...w.attachments, attachment], updatedAt: new Date().toISOString() }
          : w),
      })),
      removeWorkStatement: (id) => set((s) => ({
        workStatements: s.workStatements.filter((w) => w.id !== id),
      })),

      weeklyStatements: [],
      buildWeeklyStatement: (technicianId, weekStart, weekEnd, by) => {
        const s0 = get();
        const existingDraft = s0.weeklyStatements.find((w) =>
          w.technicianId === technicianId && w.weekStart === weekStart && (w.status === "draft" || w.status === "pending_review")
        );
        const skipped: { number: string; reason: string }[] = [];
        const candidates = s0.workStatements.filter((ws) => {
          if (ws.technicianId !== technicianId) return false;
          const job = s0.jobs.find((j) => j.id === ws.jobId);
          const d = job?.date ?? "";
          if (!(d >= weekStart && d <= weekEnd)) return false;
          const reason = batchExclusionReason(ws, { batches: s0.weeklyStatements, technicians: s0.agents, currentBatchId: existingDraft?.id ?? null });
          if (reason) { skipped.push({ number: ws.number, reason }); return false; }
          return true;
        });
        if (!candidates.length && !existingDraft) return { id: null, included: 0, skipped };

        const id = existingDraft?.id ?? uid();
        set((s) => {
          const now = new Date().toISOString();
          const totals = sumTotals(candidates.map(calcWorkStatement));
          const seq = s.weeklyStatements.length + 1;
          const wk: WeeklyTechStatement = existingDraft
            ? { ...existingDraft, statementIds: candidates.map((c) => c.id), totals, updatedAt: now }
            : {
                id, number: `WTS-${String(seq).padStart(6, "0")}`, technicianId, weekStart, weekEnd,
                statementIds: candidates.map((c) => c.id), totals, status: "draft", approval: null, scheduledFor: null,
                payments: [], paidAt: null, correctionRequest: null, reopenings: [],
                audit: [{ at: now, actor: by, type: "created", message: "" }], pdfHistory: [], createdAt: now, updatedAt: now,
              };
          const includedIds = new Set(candidates.map((c) => c.id));
          return {
            weeklyStatements: existingDraft
              ? s.weeklyStatements.map((w) => (w.id === id ? wk : w))
              : [...s.weeklyStatements, wk],
            // Stamp includedInWeeklyBatchId on everything just batched (double-
            // payment prevention) and release anything that fell out of a
            // rebuilt draft so it becomes eligible again.
            workStatements: s.workStatements.map((w) => {
              if (includedIds.has(w.id)) return { ...w, includedInWeeklyBatchId: id, batchStatus: "draft", paymentStatus: "in_batch", updatedAt: now };
              if (existingDraft && w.includedInWeeklyBatchId === id) return { ...w, includedInWeeklyBatchId: null, batchStatus: null, paymentStatus: "unpaid", updatedAt: now };
              return w;
            }),
          };
        });
        return { id, included: candidates.length, skipped };
      },
      approveWeeklyStatement: (id, by, note) => set((s) => ({
        weeklyStatements: s.weeklyStatements.map((w) =>
          w.id === id ? { ...w, status: "approved", approval: { by, at: new Date().toISOString(), note: note ?? "" }, updatedAt: new Date().toISOString() } : w
        ),
      })),
      markWeeklyStatementPaid: (id, payment) => set((s) => {
        const wk = s.weeklyStatements.find((w) => w.id === id);
        if (!wk) return {};
        const now = new Date().toISOString();
        return {
          weeklyStatements: s.weeklyStatements.map((w) =>
            w.id === id
              ? { ...w, status: "paid", paidAt: now, payments: [...w.payments, { id: uid(), date: now.slice(0, 10), ...payment }], updatedAt: now }
              : w
          ),
          // Same downstream reuse as markPayoutDocumentPaid — technicians are
          // agents, so this posts to the SAME Payment/Wallet the commission
          // side already has, which is what surfaces it in the Payout
          // Calendar and year-end 1099 totals without a parallel system.
          workStatements: s.workStatements.map((w) =>
            wk.statementIds.includes(w.id) ? { ...w, paymentStatus: "paid", paidAt: now, updatedAt: now } : w
          ),
          payments: [...s.payments, {
            id: uid(),
            agentId: wk.technicianId,
            date: now.slice(0, 10),
            amount: payment.amount,
            method: "Weekly technician statement",
            notes: `${wk.number} · ${wk.weekStart} – ${wk.weekEnd}`,
            reference: wk.number,
            status: "paid" as const,
          }],
        };
      }),
      requestWeeklyStatementCorrection: (id, by, reason) => set((s) => ({
        weeklyStatements: s.weeklyStatements.map((w) =>
          w.id === id ? { ...w, status: "correction_requested", correctionRequest: { by, at: new Date().toISOString(), reason }, updatedAt: new Date().toISOString() } : w
        ),
      })),
      removeWeeklyStatement: (id) => set((s) => ({
        weeklyStatements: s.weeklyStatements.filter((w) => w.id !== id),
        // Un-batch its statements so they become eligible again
        workStatements: s.workStatements.map((w) =>
          w.includedInWeeklyBatchId === id ? { ...w, includedInWeeklyBatchId: null, batchStatus: null, paymentStatus: "unpaid" } : w
        ),
      })),

      payrollRuns: [],
      buildPayrollRun: (periodStart, periodEnd, payDate, frequency) => {
        const id = uid();
        set((s) => {
          const now = new Date().toISOString();
          const seq = s.payrollRuns.length + 1;
          const relevantStatements = s.workStatements.filter((ws) => {
            if (ws.status !== "approved") return false;
            const job = s.jobs.find((j) => j.id === ws.jobId);
            const d = job?.date ?? "";
            return d >= periodStart && d <= periodEnd;
          });
          const byTech = new Map<string, TechWorkStatement[]>();
          for (const ws of relevantStatements) {
            if (!byTech.has(ws.technicianId)) byTech.set(ws.technicianId, []);
            byTech.get(ws.technicianId)!.push(ws);
          }
          const lines: PayrollLine[] = [];
          for (const [technicianId, statements] of byTech) {
            const tech = s.agents.find((a) => a.id === technicianId);
            if (!tech) continue;
            const is1099 = resolvePaymentTreatment(tech) !== "payroll";
            const totals = sumTotals(statements.map(calcWorkStatement));
            const plan = resolveRatePlan(s.techRatePlans, { technicianId });
            const jobIds = [...new Set(statements.map((w) => w.jobId))];
            const customerInvoiced = s.customerInvoices
              .filter((ci) => ci.jobId && jobIds.includes(ci.jobId))
              .reduce((a, ci) => a + customerInvoiceTotals(ci).total, 0);
            const laborPay = totals.base + totals.extras;
            const netBase = Math.max(0, laborPay + totals.reimbursements - totals.deductions);
            const withholdings = is1099 ? [] : withholdingsFor(s.company.withholdingRates, netBase);
            lines.push({
              id: uid(), technicianId,
              technicianName: tech.companyName?.trim() ? `${tech.companyName.trim()} — ${tech.name}` : tech.name,
              classification: tech.classification ?? "", is1099,
              jobIds, statementIds: statements.map((w) => w.id), weeklyStatementIds: [],
              jobs: jobIds.length,
              regularHours: statements.reduce((a, w) => a + (w.regularHours || 0), 0),
              overtimeHours: statements.reduce((a, w) => a + (w.overtimeHours || 0), 0),
              hourlyRate: plan?.hourlyRate ?? 0, overtimeMultiplier: plan?.overtimeMultiplier ?? 1.5,
              laborPay, reimbursements: totals.reimbursements, deductions: totals.deductions,
              withholdings, customerInvoiced, note: "",
            });
          }
          const run: PayrollRun = {
            id, number: `PR-${String(seq).padStart(6, "0")}`, periodStart, periodEnd, payDate, frequency,
            status: "draft", lines, approval: null, paidAt: null,
            audit: [{ at: now, actor: s.currentUserName, type: "created", message: "" }], pdfHistory: [], createdAt: now, updatedAt: now,
          };
          return { payrollRuns: [...s.payrollRuns, run] };
        });
        return id;
      },
      updatePayrollLine: (runId, lineId, patch) => set((s) => ({
        payrollRuns: s.payrollRuns.map((r) =>
          r.id === runId
            ? { ...r, lines: r.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)), updatedAt: new Date().toISOString() }
            : r
        ),
      })),
      approvePayrollRun: (id, by) => set((s) => ({
        payrollRuns: s.payrollRuns.map((r) =>
          r.id === id ? { ...r, status: "approved", approval: { by, at: new Date().toISOString(), note: "" }, updatedAt: new Date().toISOString() } : r
        ),
      })),
      markPayrollRunPaid: (id) => set((s) => {
        const run = s.payrollRuns.find((r) => r.id === id);
        if (!run) return {};
        const now = new Date().toISOString();
        // 1099 lines are reference-only here — they're paid through
        // contractor payables (Weekly Statements), not this run, to avoid
        // double payment. Only W-2 lines post a payment when marked paid.
        const newPayments = run.lines
          .filter((l) => !l.is1099)
          .map((l) => ({ l, net: payrollLineNet(l) }))
          .filter(({ net }) => net > 0)
          .map(({ l, net }) => ({
            id: uid(), agentId: l.technicianId, date: now.slice(0, 10), amount: net,
            method: "Payroll", notes: `${run.number} · ${run.periodStart} – ${run.periodEnd}`,
            reference: run.number, status: "paid" as const,
          }));
        return {
          payrollRuns: s.payrollRuns.map((r) => (r.id === id ? { ...r, status: "paid", paidAt: now, updatedAt: now } : r)),
          payments: [...s.payments, ...newPayments],
        };
      }),
      removePayrollRun: (id) => set((s) => ({ payrollRuns: s.payrollRuns.filter((r) => r.id !== id) })),

      agentTaxIds: [],
      setAgentTaxIdLast4: (agentId, last4) => set((s) => {
        const clean = last4.replace(/\D/g, "").slice(0, 4);
        const now = new Date().toISOString();
        const exists = s.agentTaxIds.some((t) => t.id === agentId);
        return {
          agentTaxIds: clean
            ? (exists
                ? s.agentTaxIds.map((t) => (t.id === agentId ? { ...t, last4: clean, updatedAt: now } : t))
                : [...s.agentTaxIds, { id: agentId, last4: clean, updatedAt: now }])
            : s.agentTaxIds.filter((t) => t.id !== agentId),
        };
      }),

      addDispute: (d) => {
        const id = uid();
        set((s) => {
          const now = new Date().toISOString();
          const ev: RequestEvent = {
            at: now,
            actor: "rep",
            type: "submitted",
            message: d.reason,
          };
          const agentName = s.agents.find((a) => a.id === d.agentId)?.name ?? "A user";
          const kind = d.kind ?? "correction";
          return {
            disputes: [
              ...s.disputes,
              {
                invoiceId: d.invoiceId,
                agentId: d.agentId,
                reason: d.reason,
                notes: d.notes ?? "",
                kind,
                priority: d.priority ?? "normal",
                requestedChange: d.requestedChange ?? null,
                id,
                status: "submitted",
                assignedAdminId: null,
                adminNotes: "",
                events: [ev],
                createdAt: now,
                resolvedAt: null,
                attachmentUrl: d.attachmentUrl,
              },
            ],
            notifications: [
              ...s.notifications,
              {
                id: uid(),
                at: now,
                read: false,
                kind: "dispute_submitted",
                title: `New ${kind} request from ${agentName}`,
                message: d.reason,
                audience: "admin",
                invoiceId: d.invoiceId,
                disputeId: id,
              },
            ],
          };
        });
      },
      updateDispute: (id, d) =>
        set((s) => ({
          disputes: s.disputes.map((x) =>
            x.id === id
              ? {
                  ...x,
                  ...d,
                  resolvedAt:
                    d.status &&
                    (d.status === "approved" ||
                      d.status === "rejected" ||
                      d.status === "resolved")
                      ? new Date().toISOString()
                      : x.resolvedAt,
                }
              : x
          ),
        })),
      removeDispute: (id) => set((s) => ({ disputes: s.disputes.filter((x) => x.id !== id) })),
      claimRequest: (id, adminId) =>
        set((s) => {
          const dispute = s.disputes.find((x) => x.id === id);
          const adminName = adminId
            ? s.agents.find((a) => a.id === adminId)?.name ?? "admin"
            : "admin";
          const newNotifs: Notification[] =
            dispute && adminId
              ? [
                  {
                    id: uid(),
                    at: new Date().toISOString(),
                    read: false,
                    kind: "dispute_claimed",
                    title: `Your request is being reviewed`,
                    message: `${adminName} claimed your request.`,
                    audience: { agentId: dispute.agentId },
                    invoiceId: dispute.invoiceId,
                    disputeId: id,
                  },
                ]
              : [];
          return {
            notifications: [...s.notifications, ...newNotifs],
            disputes: s.disputes.map((x) =>
              x.id === id
                ? {
                    ...x,
                    assignedAdminId: adminId,
                    status: x.status === "submitted" ? "under_review" : x.status,
                    events: [
                      ...x.events,
                      {
                        at: new Date().toISOString(),
                        actor: "admin",
                        type: "claimed",
                        message: adminId ? `Claimed by ${adminName}` : "Unassigned",
                      },
                    ],
                  }
                : x
            ),
          };
        }),
      setRequestStatus: (id, status, actor, message = "") =>
        set((s) => {
          const dispute = s.disputes.find((x) => x.id === id);
          const newNotifs: Notification[] =
            dispute && actor === "admin"
              ? [
                  {
                    id: uid(),
                    at: new Date().toISOString(),
                    read: false,
                    kind: "dispute_status",
                    title: `Your request was ${status.replace("_", " ")}`,
                    message: message || `Status updated to ${status}.`,
                    audience: { agentId: dispute.agentId },
                    invoiceId: dispute.invoiceId,
                    disputeId: id,
                  },
                ]
              : [];
          return {
            notifications: [...s.notifications, ...newNotifs],
            disputes: s.disputes.map((x) =>
              x.id === id
                ? {
                    ...x,
                    status,
                    events: [
                      ...x.events,
                      {
                        at: new Date().toISOString(),
                        actor,
                        type:
                          status === "approved"
                            ? "approved"
                            : status === "rejected"
                              ? "rejected"
                              : status === "needs_info"
                                ? "needs_info"
                                : status === "resolved"
                                  ? "resolved"
                                  : status === "submitted"
                                    ? "reopened"
                                    : "note",
                        message,
                      },
                    ],
                    resolvedAt:
                      status === "approved" || status === "rejected" || status === "resolved"
                        ? new Date().toISOString()
                        : x.resolvedAt,
                  }
                : x
            ),
          };
        }),
      appendRequestEvent: (id, ev) =>
        set((s) => ({
          disputes: s.disputes.map((x) =>
            x.id === id
              ? {
                  ...x,
                  events: [...x.events, { ...ev, at: new Date().toISOString() }],
                }
              : x
          ),
        })),
      replyToRequest: (id, actor, message) =>
        set((s) => {
          const dispute = s.disputes.find((x) => x.id === id);
          const newNotifs: Notification[] = dispute
            ? [
                actor === "rep"
                  ? {
                      id: uid(),
                      at: new Date().toISOString(),
                      read: false,
                      kind: "dispute_replied",
                      title: `Rep replied to a request`,
                      message,
                      audience: "admin" as const,
                      invoiceId: dispute.invoiceId,
                      disputeId: id,
                    }
                  : {
                      id: uid(),
                      at: new Date().toISOString(),
                      read: false,
                      kind: "dispute_replied",
                      title: `Admin replied to your request`,
                      message,
                      audience: { agentId: dispute.agentId },
                      invoiceId: dispute.invoiceId,
                      disputeId: id,
                    },
              ]
            : [];
          return {
            notifications: [...s.notifications, ...newNotifs],
            disputes: s.disputes.map((x) =>
              x.id === id
                ? {
                    ...x,
                    events: [
                      ...x.events,
                      {
                        at: new Date().toISOString(),
                        actor,
                        type: actor === "rep" ? "rep_reply" : "note",
                        message,
                      },
                    ],
                    status:
                      actor === "rep" && x.status === "needs_info" ? "under_review" : x.status,
                  }
                : x
            ),
          };
        }),

      applyTemplate: (t) =>
        set((s) => {
          let financeCompanies = s.financeCompanies;
          if (t.finance) {
            financeCompanies = [
              ...financeCompanies,
              { ...t.finance, id: uid(), active: true },
            ];
          }
          return {
            financeCompanies,
            personalTiers: t.tiers,
            overrides: t.overrides,
          };
        }),

      setPersonalTiers: (personalTiers) => set({ personalTiers }),
      setOverrides: (overrides) => set({ overrides }),
      setInvoiceMeta: (invoiceDate, periodLabel) => set({ invoiceDate, periodLabel }),
      setNextPayoutDate: (nextPayoutDate) => set({ nextPayoutDate }),
      resetAll: () =>
        set({
          ...defaults,
          agents: [],
          financeCompanies: [],
          invoices: [],
          payments: [],
          disputes: [],
          adjustments: [],
          positions: [],
          splitTemplates: defaultSplitTemplates(),
          splitRules: [],
          products: [],
          payoutDocuments: [],
          jobs: [],
          techRatePlans: [],
          customerInvoices: [],
          workStatements: [],
          weeklyStatements: [],
          payrollRuns: [],
          agentTaxIds: [],
          invoiceDraft: null,
          invoiceDraftEditingId: null,
          invoiceDraftProductId: "",
          invoiceDate: new Date().toISOString().slice(0, 10),
          periodLabel: new Date().toLocaleString("en-US", { month: "long", year: "numeric" }),
          nextPayoutDate: todayPlus(14),
          taxReserveByState: {},
          language: "es" as Lang,
          role: "admin" as Role,
          activeAgentId: null,
          notifications: [],
          currentUserName: "Admin",
        }),

      loadDemoData: () => {
        // Prevent duplicate demo loads
        if (get().agents.some((a) => a.email?.endsWith("@demo.co"))) return;
        const today = new Date();
        const dateAt = (offset: number) => {
          const d = new Date(today);
          d.setDate(d.getDate() + offset);
          return d.toISOString().slice(0, 10);
        };
        const financeId = uid();
        const financeId2 = uid();
        const repLuciaId = uid();
        const repVictoriaId = uid();
        const repDiegoId = uid();
        const mgrId = uid();
        const inv1Id = uid();
        const inv2Id = uid();
        const inv3Id = uid();
        const pay1 = uid();
        const pay2 = uid();
        const adv1 = uid();
        set((s) => {
          const prefix = s.company.invoicePrefix || "INV";
          const inv: Invoice[] = [
            ...s.invoices,
            {
              id: inv1Id,
              number: `${prefix}-${String(s.invoices.length + 1).padStart(5, "0")}`,
              date: dateAt(-1),
              status: "paid",
              agentId: repLuciaId,
              financeCompanyId: financeId,
              customerName: "Pasteur Water System",
              customerNotes: "Whole-house water softener",
              salesAmount: 8500,
              productCost: 4400,
              approvalPercent: 0.95,
              discount: 425,
              charges: [{ label: "Install", amount: 385 }],
              credits: [{ label: "Promo credit", amount: 170 }],
              advanceApplied: 500,
              specialDeductions: 0,
              taxReservePercent: 0.2,
              paid: true,
              saleType: "finance",
              ccpfPercent: 0.035,
              adminFeePercent: 0,
              approvedAdvanceAmount: 500,
              pendingAdvanceBalance: 1500,
              commissionLevel: "Senior Rep",
              commissionBase: "profit",
              split: null,
              pdfHistory: [],
            },
            {
              id: inv2Id,
              number: `${prefix}-${String(s.invoices.length + 2).padStart(5, "0")}`,
              date: dateAt(-3),
              status: "pending",
              agentId: repVictoriaId,
              financeCompanyId: financeId,
              customerName: "Acme Industrial",
              customerNotes: "Reverse osmosis system",
              salesAmount: 12500,
              productCost: 5200,
              approvalPercent: 1,
              discount: 0,
              charges: [{ label: "Permit", amount: 175 }, { label: "Install", amount: 450 }],
              credits: [],
              advanceApplied: 0,
              specialDeductions: 0,
              taxReservePercent: 0.2,
              paid: false,
              saleType: "finance",
              ccpfPercent: 0.035,
              adminFeePercent: 0,
              approvedAdvanceAmount: 0,
              pendingAdvanceBalance: 0,
              commissionLevel: "Sales Rep",
              commissionBase: "profit",
              split: null,
              pdfHistory: [],
            },
            {
              id: inv3Id,
              number: `${prefix}-${String(s.invoices.length + 3).padStart(5, "0")}`,
              date: dateAt(-7),
              status: "paid",
              agentId: repDiegoId,
              financeCompanyId: financeId2,
              customerName: "Greenfield HOA",
              customerNotes: "Community softener bundle",
              salesAmount: 22000,
              productCost: 9800,
              approvalPercent: 1,
              discount: 500,
              charges: [{ label: "Engineering", amount: 600 }],
              credits: [{ label: "Referral bonus", amount: 200 }],
              advanceApplied: 0,
              specialDeductions: 0,
              taxReservePercent: 0.22,
              paid: true,
              saleType: "credit_card",
              ccpfPercent: 0.035,
              adminFeePercent: 0,
              approvedAdvanceAmount: 0,
              pendingAdvanceBalance: 0,
              commissionLevel: "Manager",
              commissionBase: "profit",
              split: null,
              pdfHistory: [],
            },
          ];
          return {
            company: {
              ...s.company,
              name:
                s.company.name === "Your Company Ltd." || !s.company.name
                  ? "Pasteur Water System Demo"
                  : s.company.name,
              brandColor: s.company.brandColor || "#0B1F3A",
              brandColorSecondary: s.company.brandColorSecondary || "#2563EB",
            },
            agents: [
              { id: mgrId, name: "Carlos Rivera", email: "carlos@demo.co", sponsorId: null, level: "Manager", commissionPercent: 0.04, w9Status: "valid", state: "FL", taxReservePercent: 0.2, paymentMethod: "ACH" },
              { id: repLuciaId, name: "Lucia Molina", email: "lucia@demo.co", sponsorId: mgrId, level: "Senior Rep", commissionPercent: 0.08, w9Status: "valid", state: "FL", taxReservePercent: 0.2, paymentMethod: "ACH" },
              { id: repVictoriaId, name: "Victoria Mieses", email: "victoria@demo.co", sponsorId: mgrId, level: "Sales Rep", commissionPercent: 0.085, w9Status: "valid", state: "FL", taxReservePercent: 0.2, paymentMethod: "ACH" },
              { id: repDiegoId, name: "Diego Fernández", email: "diego@demo.co", sponsorId: mgrId, level: "Senior Rep", commissionPercent: 0.09, w9Status: "valid", state: "TX", taxReservePercent: 0.22, paymentMethod: "ACH" },
              ...s.agents,
            ],
            financeCompanies: [
              { id: financeId, name: "Goodleap", defaultFee: 0.05, dealerFee: 0, adminFee: 0, usesApprovalDiscount: true, active: true, notes: "Demo lender" },
              { id: financeId2, name: "AquaFinance", defaultFee: 0.07, dealerFee: 195, adminFee: 50, usesApprovalDiscount: true, active: true, notes: "Demo lender" },
              ...s.financeCompanies,
            ],
            invoices: inv,
            payments: [
              ...s.payments,
              { id: pay1, agentId: repLuciaId, date: dateAt(-1), amount: 680, method: "ACH", notes: "Commission INV-00001", reference: "PAY-001" },
              { id: pay2, agentId: repDiegoId, date: dateAt(-7), amount: 1620, method: "ACH", notes: "Commission INV-00003", reference: "PAY-002" },
            ],
            adjustments: [
              ...s.adjustments,
              { id: adv1, agentId: repLuciaId, invoiceId: inv1Id, kind: "advance", amount: 500, date: dateAt(-10), note: "Q-start advance", createdBy: "admin", createdAt: new Date().toISOString() },
            ],
          };
        });
      },

});

export const useStore = create<State>()(
  persist(
    storeCreator,
    {
      name: "commission-tool-v3",
      partialize: (state: any) => {
        // Exclude language so it always resets to the default "es" on load
        const { language, ...rest } = state;
        return rest;
      },
      migrate: (persisted: any) => {
        if (persisted?.disputes) {
          persisted.disputes = persisted.disputes.map((d: any) => ({
            kind: "correction",
            priority: "normal",
            assignedAdminId: null,
            requestedChange: null,
            events: [],
            notes: "",
            adminNotes: "",
            ...d,
            status: d.status === "open" ? "submitted" : d.status,
          }));
        }
        if (persisted && !persisted.adjustments) persisted.adjustments = [];
        if (persisted && !persisted.positions) persisted.positions = [];
        if (persisted && !persisted.products) persisted.products = [];
        if (persisted && !persisted.splitTemplates) persisted.splitTemplates = defaultSplitTemplates();
        if (persisted && !persisted.splitRules) persisted.splitRules = [];
        if (persisted && !persisted.wizard)
          persisted.wizard = { currentStep: 0, completedSteps: [], completed: false };
        if (persisted && !persisted.notifications) persisted.notifications = [];
        if (persisted && !persisted.agentTaxIds) persisted.agentTaxIds = [];
        if (persisted && !persisted.currentUserName) persisted.currentUserName = "Admin";
        if (persisted?.company) {
          persisted.company = {
            logoDataUrl: "",
            brandColorSecondary: "#2563EB",
            footerText: "Thank you for your business.",
            disclaimerText:
              "All amounts are subject to verification. Tax reserves are suggestions, not official tax advice.",
            invoiceTemplate: "classic",
            commissionEntryMode: "fixed",
            technicianTermSingular: "",
            technicianTermPlural: "",
            allowMultipleOriginalStatements: false,
            withholdingRates: DEFAULT_WITHHOLDINGS,
            ...persisted.company,
          };
        }
        if (persisted?.invoices) {
          persisted.invoices = persisted.invoices.map((i: any) => ({
            saleType: "finance",
            ccpfPercent: 0.035,
            adminFeePercent: 0,
            dealerFee: undefined,
            approvedAdvanceAmount: 0,
            pendingAdvanceBalance: 0,
            commissionLevel: "",
            commissionBase: "profit",
            ...i,
          }));
        }
        return persisted;
      },
    }
  )
);
