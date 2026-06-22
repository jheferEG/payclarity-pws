import { create } from "zustand";
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
  level?: string;             // commission level label (e.g. Junior Rep, Sales Rep, Manager)
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
  brandingSnapshot?: CompanyBranding & { companyName: string; address: string; email: string; phone: string; taxId: string; currency: string }; // captured at PDF generation
  split?: InvoiceSplit | null;
  pdfHistory?: InvoicePdfRecord[];
};

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
};

export type Payment = {
  id: string;
  agentId: string;
  date: string;
  amount: number;
  method: string;
  notes: string;
  reference: string;
};

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
};

export type IndustryTemplate = {
  id: string;
  name: string;
  description: string;
  charges: LineItem[];
  finance: Omit<FinanceCompany, "id" | "active"> | null;
  tiers: PersonalTier[];
  overrides: OverrideLevel[];
  taxReservePercent: number;
};

export type Role = "admin" | "rep" | "accountant";
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

  addPayment: (p: Omit<Payment, "id">) => void;
  removePayment: (id: string) => void;

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
    openTimeline?: boolean;
    openSplit?: boolean;
    openDispute?: boolean;
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
  const n = list.filter((i) => i.number?.startsWith(prefix)).length + 1;
  return `${prefix}-${String(n).padStart(5, "0")}`;
};

const todayPlus = (d: number) => {
  const x = new Date();
  x.setDate(x.getDate() + d);
  return x.toISOString().slice(0, 10);
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
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
      setTaxReserveByState: (taxReserveByState) => set({ taxReserveByState }),

      role: "admin" as Role,
      activeAgentId: null,
      setRole: (role) => set({ role }),
      setActiveAgentId: (activeAgentId) => set({ activeAgentId }),

      setCompany: (c) => set((s) => ({ company: { ...s.company, ...c } })),

      addAgent: (a) => set((s) => ({ agents: [...s.agents, { ...a, id: uid() }] })),
      updateAgent: (id, a) =>
        set((s) => ({ agents: s.agents.map((x) => (x.id === id ? { ...x, ...a } : x)) })),
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
        set((s) => ({ financeCompanies: [...s.financeCompanies, { ...f, id }] }));
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
        set((s) => ({ invoices: s.invoices.map((x) => (x.id === id ? { ...x, ...i } : x)) })),
      removeInvoice: (id) =>
        set((s) => ({
          invoices: s.invoices.filter((x) => x.id !== id),
          disputes: s.disputes.filter((x) => x.invoiceId !== id),
          adjustments: s.adjustments.filter((x) => x.invoiceId !== id),
        })),

      addPayment: (p) => set((s) => ({ payments: [...s.payments, { ...p, id: uid() }] })),
      removePayment: (id) => set((s) => ({ payments: s.payments.filter((x) => x.id !== id) })),

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

    }),
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
        if (persisted && !persisted.currentUserName) persisted.currentUserName = "Admin";
        if (persisted?.company) {
          persisted.company = {
            logoDataUrl: "",
            brandColorSecondary: "#4F6BFF",
            footerText: "Thank you for your business.",
            disclaimerText:
              "All amounts are subject to verification. Tax reserves are suggestions, not official tax advice.",
            invoiceTemplate: "classic",
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
