import type { Tables } from "@/integrations/supabase/types";
import type {
  Agent, FinanceCompany, Invoice, LineItem, InvoiceSplit, SplitParticipant,
  Payment, Adjustment, Dispute, RequestEvent, Notification, NotificationKind,
  PersonalTier, OverrideLevel, Company, W9Status,
  SplitTemplate, SplitParticipantRole, SplitRule, SplitRuleCriteria,
  Product, CompensationPosition, PayoutDocument,
} from "./commission-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (id: string) => UUID_RE.test(id);

// ─── COMPANY ─────────────────────────────────────────────────────────────────

export function adaptCompany(row: Tables<"companies">): Partial<Company> {
  return {
    name: row.name,
    address: row.address,
    email: row.email,
    phone: row.phone,
    taxId: row.tax_id,
    currency: row.currency,
    invoicePrefix: row.invoice_prefix,
    brandColor: row.brand_color,
    brandColorSecondary: row.brand_color_secondary,
    logoDataUrl: row.logo_data_url,
    footerText: row.footer_text,
    disclaimerText: row.disclaimer_text,
    invoiceTemplate: row.invoice_template as Company["invoiceTemplate"],
  };
}

export function companyToRow(c: Company) {
  return {
    name: c.name,
    address: c.address,
    email: c.email,
    phone: c.phone,
    tax_id: c.taxId,
    currency: c.currency,
    invoice_prefix: c.invoicePrefix,
    brand_color: c.brandColor,
    brand_color_secondary: c.brandColorSecondary,
    logo_data_url: c.logoDataUrl,
    footer_text: c.footerText,
    disclaimer_text: c.disclaimerText,
    invoice_template: c.invoiceTemplate,
  };
}

// ─── AGENTS ──────────────────────────────────────────────────────────────────

export function adaptAgent(row: Tables<"agents">): Agent {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    sponsorId: row.sponsor_id ?? null,
    w9Status: (row.w9_status as W9Status) ?? "missing",
    state: row.state ?? undefined,
    paymentMethod: row.payment_method ?? undefined,
    taxReservePercent: row.tax_reserve_percent != null ? Number(row.tax_reserve_percent) : undefined,
    commissionPercent: row.commission_percent != null ? Number(row.commission_percent) : undefined,
    commissionMode: row.commission_mode ?? undefined,
    fixedCommissionAmount: row.fixed_commission_amount != null ? Number(row.fixed_commission_amount) : undefined,
    avatarUrl: row.avatar_url ?? undefined,
    level: row.level ?? undefined,
  };
}

export function agentToRow(a: Agent, companyId: string) {
  return {
    id: a.id,
    company_id: companyId,
    name: a.name,
    email: a.email,
    sponsor_id: a.sponsorId ?? undefined,
    w9_status: a.w9Status ?? "missing",
    state: a.state ?? undefined,
    payment_method: a.paymentMethod ?? undefined,
    tax_reserve_percent: a.taxReservePercent ?? 0.2,
    commission_percent: a.commissionPercent ?? undefined,
    commission_mode: a.commissionMode ?? undefined,
    fixed_commission_amount: a.fixedCommissionAmount ?? undefined,
    avatar_url: a.avatarUrl ?? undefined,
    level: a.level ?? undefined,
  };
}

// ─── FINANCE COMPANIES ───────────────────────────────────────────────────────

export function adaptFinanceCo(row: Tables<"finance_companies">): FinanceCompany {
  return {
    id: row.id,
    name: row.name,
    defaultFee: Number(row.default_fee),
    dealerFee: Number(row.dealer_fee),
    adminFee: Number(row.admin_fee),
    usesApprovalDiscount: row.uses_approval_discount,
    active: row.active,
    notes: row.notes,
  };
}

export function financeCoToRow(f: FinanceCompany, companyId: string) {
  return {
    id: f.id,
    company_id: companyId,
    name: f.name,
    default_fee: f.defaultFee,
    dealer_fee: f.dealerFee,
    admin_fee: f.adminFee,
    uses_approval_discount: f.usesApprovalDiscount,
    active: f.active,
    notes: f.notes,
  };
}

// ─── INVOICES ────────────────────────────────────────────────────────────────

type InvoiceRow = Tables<"invoices"> & {
  invoice_line_items?: Tables<"invoice_line_items">[];
  invoice_splits?: (Tables<"invoice_splits"> & {
    invoice_split_participants?: Tables<"invoice_split_participants">[];
  })[];
};

export function adaptInvoice(row: InvoiceRow): Invoice {
  const charges: LineItem[] = (row.invoice_line_items ?? [])
    .filter((li) => li.kind === "charge")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((li) => ({ label: li.label, amount: Number(li.amount) }));

  const credits: LineItem[] = (row.invoice_line_items ?? [])
    .filter((li) => li.kind === "credit")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((li) => ({ label: li.label, amount: Number(li.amount) }));

  const splitRow = (row.invoice_splits ?? [])[0];
  let split: InvoiceSplit | null = null;
  if (splitRow) {
    const participants: SplitParticipant[] = (splitRow.invoice_split_participants ?? []).map((p) => ({
      id: p.id,
      agentId: p.agent_id ?? null,
      displayName: p.display_name,
      role: p.role as SplitParticipant["role"],
      customRoleLabel: p.custom_role_label ?? undefined,
      splitPercent: Number(p.split_percent),
      commissionLevel: p.commission_level ?? undefined,
      notes: p.notes ?? undefined,
    }));
    split = {
      participants,
      appliedRuleId: splitRow.applied_rule_id ?? null,
      appliedTemplateId: splitRow.applied_template_id ?? null,
      approvedAt: splitRow.approved_at ?? null,
      approvedBy: splitRow.approved_by ?? null,
      history: [],
    };
  }

  return {
    id: row.id,
    number: row.number,
    date: row.date,
    status: row.status as Invoice["status"],
    agentId: row.agent_id ?? "",
    financeCompanyId: row.finance_company_id ?? null,
    customerName: row.customer_name,
    customerNotes: row.customer_notes,
    salesAmount: Number(row.sales_amount),
    productCost: Number(row.product_cost),
    approvalPercent: Number(row.approval_percent),
    discount: Number(row.discount),
    charges,
    credits,
    advanceApplied: Number(row.advance_applied),
    specialDeductions: Number(row.special_deductions),
    taxReservePercent: Number(row.tax_reserve_percent),
    paid: row.paid,
    saleType: (row.sale_type as Invoice["saleType"]) ?? undefined,
    ccpfPercent: row.ccpf_percent != null ? Number(row.ccpf_percent) : undefined,
    adminFeePercent: row.admin_fee_percent != null ? Number(row.admin_fee_percent) : undefined,
    dealerFee: row.dealer_fee != null ? Number(row.dealer_fee) : undefined,
    approvedAdvanceAmount: row.approved_advance_amount != null ? Number(row.approved_advance_amount) : undefined,
    pendingAdvanceBalance: row.pending_advance_balance != null ? Number(row.pending_advance_balance) : undefined,
    commissionLevel: row.commission_level ?? undefined,
    commissionBase: (row.commission_base as Invoice["commissionBase"]) ?? undefined,
    commissionPercentOverride: row.commission_percent_override != null ? Number(row.commission_percent_override) : undefined,
    brandingSnapshot: (row.branding_snapshot as any) ?? undefined,
    split,
    pdfHistory: [],
  };
}

export function invoiceCoreToRow(inv: Invoice, companyId: string) {
  return {
    id: inv.id,
    company_id: companyId,
    number: inv.number,
    date: inv.date,
    status: inv.status,
    agent_id: inv.agentId,
    finance_company_id: inv.financeCompanyId ?? null,
    customer_name: inv.customerName,
    customer_notes: inv.customerNotes,
    sales_amount: inv.salesAmount,
    product_cost: inv.productCost,
    approval_percent: inv.approvalPercent,
    discount: inv.discount,
    advance_applied: inv.advanceApplied,
    special_deductions: inv.specialDeductions,
    tax_reserve_percent: inv.taxReservePercent,
    paid: inv.paid,
    sale_type: inv.saleType ?? null,
    ccpf_percent: inv.ccpfPercent ?? null,
    admin_fee_percent: inv.adminFeePercent ?? null,
    dealer_fee: inv.dealerFee ?? null,
    approved_advance_amount: inv.approvedAdvanceAmount ?? null,
    pending_advance_balance: inv.pendingAdvanceBalance ?? null,
    commission_level: inv.commissionLevel ?? null,
    commission_base: inv.commissionBase ?? null,
    commission_percent_override: inv.commissionPercentOverride ?? null,
    branding_snapshot: (inv.brandingSnapshot as any) ?? null,
  };
}

// ─── PAYMENTS ────────────────────────────────────────────────────────────────

export function adaptPayment(row: Tables<"payments">): Payment {
  return {
    id: row.id,
    agentId: row.agent_id,
    date: row.date,
    amount: Number(row.amount),
    method: row.method,
    notes: row.notes,
    reference: row.reference,
    scheduledDate: row.scheduled_date ?? undefined,
    status: row.status ?? undefined,
  };
}

export function paymentToRow(p: Payment, companyId: string) {
  return {
    id: p.id,
    company_id: companyId,
    agent_id: p.agentId,
    date: p.date,
    amount: p.amount,
    method: p.method,
    notes: p.notes,
    reference: p.reference,
    scheduled_date: p.scheduledDate ?? undefined,
    status: p.status ?? undefined,
  };
}

// ─── PAYOUT DOCUMENTS ────────────────────────────────────────────────────────

export function adaptPayoutDocument(row: Tables<"payout_documents">): PayoutDocument {
  return {
    id: row.id,
    number: row.number,
    invoiceId: row.invoice_id,
    agentId: row.agent_id,
    roleLabel: row.role_label,
    description: row.description,
    amount: Number(row.amount),
    status: row.status,
    scheduledDate: row.scheduled_date,
    rejectedReason: row.rejected_reason,
    deliveredAt: row.delivered_at,
    pdfVersions: row.pdf_versions,
    lastPdfAt: row.last_pdf_at,
    lastPdfBy: row.last_pdf_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function payoutDocumentToRow(d: PayoutDocument, companyId: string) {
  return {
    id: d.id,
    company_id: companyId,
    number: d.number,
    invoice_id: d.invoiceId,
    agent_id: d.agentId,
    role_label: d.roleLabel,
    description: d.description,
    amount: d.amount,
    status: d.status,
    scheduled_date: d.scheduledDate,
    rejected_reason: d.rejectedReason,
    delivered_at: d.deliveredAt,
    pdf_versions: d.pdfVersions,
    last_pdf_at: d.lastPdfAt,
    last_pdf_by: d.lastPdfBy,
  };
}

// ─── ADJUSTMENTS ─────────────────────────────────────────────────────────────

export function adaptAdjustment(row: Tables<"adjustments">): Adjustment {
  return {
    id: row.id,
    agentId: row.agent_id,
    invoiceId: row.invoice_id ?? null,
    kind: row.kind as Adjustment["kind"],
    amount: Number(row.amount),
    date: row.date,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function adjustmentToRow(a: Adjustment, companyId: string) {
  return {
    id: a.id,
    company_id: companyId,
    agent_id: a.agentId,
    invoice_id: a.invoiceId ?? null,
    kind: a.kind,
    amount: a.amount,
    date: a.date,
    note: a.note,
    created_by: a.createdBy,
  };
}

// ─── DISPUTES ────────────────────────────────────────────────────────────────

type DisputeRow = Tables<"disputes"> & {
  dispute_events?: Tables<"dispute_events">[];
};

export function adaptDispute(row: DisputeRow): Dispute {
  const events: RequestEvent[] = (row.dispute_events ?? [])
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((ev) => ({
      at: ev.at,
      actor: ev.actor as RequestEvent["actor"],
      type: ev.type as RequestEvent["type"],
      message: ev.message,
    }));

  return {
    id: row.id,
    invoiceId: row.invoice_id ?? "",
    agentId: row.agent_id ?? "",
    reason: row.reason ?? "",
    notes: row.notes ?? "",
    kind: row.kind as Dispute["kind"],
    priority: row.priority as Dispute["priority"],
    status: row.status as Dispute["status"],
    assignedAdminId: row.assigned_admin_id ?? null,
    adminNotes: row.admin_notes,
    requestedChange: (row.requested_change as any) ?? null,
    attachmentUrl: row.attachment_url ?? undefined,
    events,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? null,
  };
}

export function disputeToRow(d: Dispute, companyId: string) {
  return {
    id: d.id,
    company_id: companyId,
    invoice_id: d.invoiceId,
    agent_id: d.agentId,
    reason: d.reason,
    notes: d.notes,
    kind: d.kind,
    priority: d.priority,
    status: d.status,
    assigned_admin_id: d.assignedAdminId ?? null,
    admin_notes: d.adminNotes ?? "",
    requested_change: (d.requestedChange as any) ?? null,
    attachment_url: d.attachmentUrl ?? undefined,
  };
}

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────

export function adaptNotification(row: Tables<"notifications">): Notification {
  return {
    id: row.id,
    at: row.at,
    kind: row.kind as NotificationKind,
    title: row.title,
    message: row.message,
    audience: row.audience === "admin" ? "admin" : { agentId: row.audience },
    invoiceId: row.invoice_id ?? undefined,
    disputeId: row.dispute_id ?? undefined,
    read: row.read,
  };
}

export function notificationToRow(n: Notification, companyId: string) {
  return {
    id: n.id,
    company_id: companyId,
    kind: n.kind,
    title: n.title,
    message: n.message,
    audience: n.audience === "admin" ? "admin" : (n.audience as { agentId: string }).agentId,
    invoice_id: n.invoiceId ?? null,
    dispute_id: n.disputeId ?? null,
    read: n.read,
  };
}

// ─── COMMISSION PLAN ─────────────────────────────────────────────────────────

export function adaptPersonalTier(row: Tables<"commission_tiers">): PersonalTier {
  return {
    minVolume: Number(row.min_volume),
    rate: Number(row.rate),
  };
}

export function adaptOverrideLevel(row: Tables<"override_levels">): OverrideLevel {
  return {
    level: row.level,
    rate: Number(row.rate),
  };
}

// ─── SPLIT TEMPLATES ─────────────────────────────────────────────────────────

type SplitTemplateRow = Tables<"split_templates"> & {
  split_template_positions?: Tables<"split_template_positions">[];
};

export function adaptSplitTemplate(row: SplitTemplateRow): SplitTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    positions: (row.split_template_positions ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => ({
        role: p.role as SplitParticipantRole,
        customRoleLabel: p.custom_role_label ?? undefined,
        splitPercent: Number(p.split_percent),
        displayName: p.display_name ?? undefined,
      })),
  };
}

export function splitTemplateToRow(t: SplitTemplate, companyId: string) {
  return {
    id: t.id,
    company_id: companyId,
    name: t.name,
    description: t.description,
  };
}

export function splitTemplatePositionsToRows(t: SplitTemplate) {
  return t.positions.map((p, i) => ({
    template_id: t.id,
    role: p.role,
    custom_role_label: p.customRoleLabel ?? null,
    split_percent: p.splitPercent,
    display_name: p.displayName ?? null,
    sort_order: i,
  }));
}

// ─── SPLIT RULES ─────────────────────────────────────────────────────────────

export function adaptSplitRule(row: Tables<"split_rules">): SplitRule {
  return {
    id: row.id,
    name: row.name,
    priority: row.priority,
    active: row.active,
    criteria: (row.criteria as SplitRuleCriteria) ?? {},
    templateId: row.template_id,
    notes: row.notes,
  };
}

export function splitRuleToRow(r: SplitRule, companyId: string) {
  return {
    id: r.id,
    company_id: companyId,
    name: r.name,
    priority: r.priority,
    active: r.active,
    template_id: r.templateId,
    criteria: r.criteria as Record<string, unknown>,
    notes: r.notes ?? "",
  };
}

// ─── PRODUCTS ────────────────────────────────────────────────────────────────

export function adaptProduct(row: Tables<"products">): Product {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    kind: row.kind,
    price: Number(row.price),
    cost: Number(row.cost),
    priceEditable: row.price_editable,
    active: row.active,
    notes: row.notes,
    photoUrl: row.photo_url ?? undefined,
  };
}

export function productToRow(p: Product, companyId: string) {
  return {
    id: p.id,
    company_id: companyId,
    name: p.name,
    sku: p.sku,
    kind: p.kind,
    price: p.price,
    cost: p.cost,
    price_editable: p.priceEditable,
    active: p.active,
    notes: p.notes,
    photo_url: p.photoUrl ?? undefined,
  };
}

// ─── COMPENSATION POSITIONS ──────────────────────────────────────────────────

export function adaptPosition(row: Tables<"compensation_positions">): CompensationPosition {
  return {
    id: row.id,
    name: row.name,
    commissionPercent: Number(row.commission_percent),
    fixedPayout: Number(row.fixed_payout),
    overrideEligible: row.override_eligible,
    differentialOverridePercent: Number(row.differential_override_percent),
    splitDefaultPercent: Number(row.split_default_percent),
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? "",
    active: row.active,
    financeCompanyId: row.finance_company_id ?? null,
    productRule: row.product_rule,
    minApprovalPercent: Number(row.min_approval_percent),
    specialDeductionPercent: Number(row.special_deduction_percent),
    notes: row.notes,
  };
}

export function positionToRow(p: CompensationPosition, companyId: string) {
  return {
    id: p.id,
    company_id: companyId,
    name: p.name,
    commission_percent: p.commissionPercent,
    fixed_payout: p.fixedPayout,
    override_eligible: p.overrideEligible,
    differential_override_percent: p.differentialOverridePercent,
    split_default_percent: p.splitDefaultPercent,
    effective_from: p.effectiveFrom,
    effective_to: p.effectiveTo || null,
    active: p.active,
    finance_company_id: p.financeCompanyId ?? null,
    product_rule: p.productRule,
    min_approval_percent: p.minApprovalPercent,
    special_deduction_percent: p.specialDeductionPercent,
    notes: p.notes,
  };
}
