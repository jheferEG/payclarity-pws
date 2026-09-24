import type { Tables } from "@/integrations/supabase/types";
import type {
  Agent, FinanceCompany, Invoice, LineItem, InvoiceSplit, SplitParticipant,
  Payment, Adjustment, Dispute, RequestEvent, Notification, NotificationKind,
  PersonalTier, OverrideLevel, Company, W9Status,
  SplitTemplate, SplitParticipantRole, SplitRule, SplitRuleCriteria,
  Product, CompensationPosition, PayoutDocument, InvoiceExtra, CustomerPayment,
  CustomerInvoice, CustomerInvoiceStatus, CustomerInvoiceLineItem, CustomerInvoicePayment,
  InvoiceTemplateId, AgentTaxId,
  Job, JobStatus, GeoPoint, StatementAttachment, DocEvent, DocPdfRecord,
  TechRatePlan, RatePlanRule,
  TechWorkStatement, WorkStatementStatus, PayableStatus, StatementType, RateSnapshot, RateOverrideLog,
  TechnicianClassification,
  WeeklyTechStatement, WeeklyStatementStatus, WeeklyPaymentRecord, StatementTotals,
  PayrollRun, PayrollStatus, PayrollLine, WithholdingRate,
} from "./commission-store";
import { DEFAULT_WITHHOLDINGS } from "./commission-store";

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
    commissionEntryMode: (row.commission_entry_mode as Company["commissionEntryMode"]) ?? "fixed",
    technicianTermSingular: row.technician_term_singular ?? "",
    technicianTermPlural: row.technician_term_plural ?? "",
    allowMultipleOriginalStatements: row.allow_multiple_original_statements ?? false,
    withholdingRates: (row.withholding_rates as unknown as WithholdingRate[] | null) ?? DEFAULT_WITHHOLDINGS,
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
    commission_entry_mode: c.commissionEntryMode,
    technician_term_singular: c.technicianTermSingular || null,
    technician_term_plural: c.technicianTermPlural || null,
    allow_multiple_original_statements: c.allowMultipleOriginalStatements ?? false,
    withholding_rates: c.withholdingRates ?? DEFAULT_WITHHOLDINGS,
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
    companyName: row.company_name ?? undefined,
    payrollType: (row.payroll_type as Agent["payrollType"]) ?? undefined,
    paymentTreatment: (row.payment_treatment as Agent["paymentTreatment"]) ?? undefined,
    phone: row.phone ?? undefined,
    classification: (row.classification as TechnicianClassification) ?? undefined,
    active: row.active ?? undefined,
    technicianNotes: row.technician_notes ?? undefined,
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
    company_name: a.companyName ?? undefined,
    payroll_type: a.payrollType ?? undefined,
    payment_treatment: a.paymentTreatment ?? undefined,
    phone: a.phone ?? undefined,
    classification: a.classification ?? undefined,
    active: a.active ?? undefined,
    technician_notes: a.technicianNotes ?? undefined,
  };
}

// ─── AGENT TAX IDS (masked — last 4 digits only) ────────────────────────────

export function adaptAgentTaxId(row: Tables<"agent_tax_ids">): AgentTaxId {
  return { id: row.agent_id, last4: row.tax_id_last4, updatedAt: row.updated_at };
}

export function agentTaxIdToRow(t: AgentTaxId, companyId: string) {
  return { agent_id: t.id, company_id: companyId, tax_id_last4: t.last4 };
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
    overrideAmountOverrides: (row.override_amount_overrides as unknown as Record<string, number> | null) ?? undefined,
    overrideDeductions: (row.override_deductions as unknown as Record<string, { id: string; label: string; amount: number }[]> | null) ?? undefined,
    brandingSnapshot: (row.branding_snapshot as any) ?? undefined,
    split,
    pdfHistory: [],
    isGeneralInvoice: row.is_general_invoice ?? undefined,
    jobType: (row.job_type as Invoice["jobType"]) ?? undefined,
    fixedPay: row.fixed_pay != null ? Number(row.fixed_pay) : undefined,
    extras: (row.extras as unknown as InvoiceExtra[] | null) ?? undefined,
    customerAddress: row.customer_address ?? undefined,
    customerPhone: row.customer_phone ?? undefined,
    invoiceItemLabel: row.invoice_item_label ?? undefined,
    customerPayments: (row.customer_payments as unknown as CustomerPayment[] | null) ?? undefined,
    paymentPlanNote: row.payment_plan_note ?? undefined,
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
    override_amount_overrides: inv.overrideAmountOverrides ?? {},
    override_deductions: inv.overrideDeductions ?? {},
    branding_snapshot: (inv.brandingSnapshot as any) ?? null,
    is_general_invoice: inv.isGeneralInvoice ?? false,
    job_type: inv.jobType ?? null,
    fixed_pay: inv.fixedPay ?? null,
    extras: inv.extras ?? null,
    customer_address: inv.customerAddress ?? null,
    customer_phone: inv.customerPhone ?? null,
    invoice_item_label: inv.invoiceItemLabel ?? null,
    customer_payments: inv.customerPayments ?? null,
    payment_plan_note: inv.paymentPlanNote ?? null,
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

// ─── JOBS ────────────────────────────────────────────────────────────────────

export function adaptJob(row: Tables<"jobs">): Job {
  return {
    id: row.id,
    number: row.number,
    technicianId: row.technician_id,
    customerName: row.customer_name,
    billingAddress: row.billing_address,
    serviceAddress: row.service_address,
    serviceGeo: (row.service_geo as unknown as GeoPoint | null) ?? null,
    date: row.date,
    jobType: row.job_type,
    productInstalled: row.product_installed,
    territory: row.territory,
    status: row.status as JobStatus,
    attachments: (row.attachments as unknown as StatementAttachment[] | null) ?? [],
    saleInvoiceId: row.sale_invoice_id,
    salesAgentId: row.sales_agent_id ?? undefined,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function jobToRow(j: Job, companyId: string) {
  return {
    id: j.id,
    company_id: companyId,
    number: j.number,
    technician_id: j.technicianId,
    customer_name: j.customerName,
    billing_address: j.billingAddress,
    service_address: j.serviceAddress,
    service_geo: j.serviceGeo ?? null,
    date: j.date,
    job_type: j.jobType,
    product_installed: j.productInstalled,
    territory: j.territory,
    status: j.status,
    attachments: j.attachments,
    sale_invoice_id: j.saleInvoiceId,
    sales_agent_id: j.salesAgentId ?? null,
    notes: j.notes,
  };
}

// ─── RATE PLANS ──────────────────────────────────────────────────────────────

export function adaptRatePlan(row: Tables<"tech_rate_plans">): TechRatePlan {
  return {
    id: row.id,
    name: row.name,
    technicianId: row.technician_id,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    active: row.active,
    fixedInstallRate: Number(row.fixed_install_rate),
    serviceCallRate: Number(row.service_call_rate),
    emergencyRate: Number(row.emergency_rate),
    mileageRate: Number(row.mileage_rate),
    extraLaborHourlyRate: Number(row.extra_labor_hourly_rate),
    materialReimbursementPercent: Number(row.material_reimbursement_percent),
    materialReimbursementCap: Number(row.material_reimbursement_cap),
    hourlyRate: row.hourly_rate != null ? Number(row.hourly_rate) : undefined,
    overtimeMultiplier: row.overtime_multiplier != null ? Number(row.overtime_multiplier) : undefined,
    rules: (row.rules as unknown as RatePlanRule[] | null) ?? [],
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function ratePlanToRow(p: TechRatePlan, companyId: string) {
  return {
    id: p.id,
    company_id: companyId,
    name: p.name,
    technician_id: p.technicianId,
    effective_from: p.effectiveFrom,
    effective_to: p.effectiveTo,
    active: p.active,
    fixed_install_rate: p.fixedInstallRate,
    service_call_rate: p.serviceCallRate,
    emergency_rate: p.emergencyRate,
    mileage_rate: p.mileageRate,
    extra_labor_hourly_rate: p.extraLaborHourlyRate,
    material_reimbursement_percent: p.materialReimbursementPercent,
    material_reimbursement_cap: p.materialReimbursementCap,
    hourly_rate: p.hourlyRate ?? null,
    overtime_multiplier: p.overtimeMultiplier ?? null,
    rules: p.rules,
    notes: p.notes,
  };
}

// ─── CUSTOMER INVOICES ───────────────────────────────────────────────────────

export function adaptCustomerInvoice(row: Tables<"customer_invoices">): CustomerInvoice {
  return {
    id: row.id,
    number: row.number,
    jobId: row.job_id,
    saleInvoiceId: row.sale_invoice_id,
    status: row.status as CustomerInvoiceStatus,
    customerName: row.customer_name,
    customerEmail: row.customer_email ?? "",
    billingAddress: row.billing_address,
    billingGeo: (row.billing_geo as unknown as GeoPoint | null) ?? null,
    serviceAddress: row.service_address,
    serviceGeo: (row.service_geo as unknown as GeoPoint | null) ?? null,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    lineItems: (row.line_items as unknown as CustomerInvoiceLineItem[] | null) ?? [],
    discount: Number(row.discount),
    taxPercent: Number(row.tax_percent),
    deposit: Number(row.deposit),
    financingApplied: Number(row.financing_applied),
    paymentTerms: row.payment_terms,
    notes: row.notes,
    warrantyInfo: row.warranty_info,
    templateId: (row.template_id as InvoiceTemplateId | null) ?? undefined,
    attachments: (row.attachments as unknown as StatementAttachment[] | null) ?? [],
    payments: (row.payments as unknown as CustomerInvoicePayment[] | null) ?? [],
    history: (row.history as unknown as DocEvent[] | null) ?? [],
    pdfHistory: (row.pdf_history as unknown as DocPdfRecord[] | null) ?? [],
    sentAt: row.sent_at,
    viewedAt: row.viewed_at,
    brandingSnapshot: (row.branding_snapshot as any) ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function customerInvoiceToRow(d: CustomerInvoice, companyId: string) {
  return {
    id: d.id,
    company_id: companyId,
    number: d.number,
    job_id: d.jobId,
    sale_invoice_id: d.saleInvoiceId,
    status: d.status,
    customer_name: d.customerName,
    customer_email: d.customerEmail,
    billing_address: d.billingAddress,
    billing_geo: d.billingGeo ?? null,
    service_address: d.serviceAddress,
    service_geo: d.serviceGeo ?? null,
    invoice_date: d.invoiceDate,
    due_date: d.dueDate,
    line_items: d.lineItems,
    discount: d.discount,
    tax_percent: d.taxPercent,
    deposit: d.deposit,
    financing_applied: d.financingApplied,
    payment_terms: d.paymentTerms,
    notes: d.notes,
    warranty_info: d.warrantyInfo,
    template_id: d.templateId ?? null,
    attachments: d.attachments,
    payments: d.payments,
    history: d.history,
    pdf_history: d.pdfHistory,
    sent_at: d.sentAt,
    viewed_at: d.viewedAt,
    branding_snapshot: (d.brandingSnapshot as any) ?? null,
  };
}

// ─── TECHNICIAN WORK STATEMENTS ──────────────────────────────────────────────

export function adaptWorkStatement(row: Tables<"technician_work_statements">): TechWorkStatement {
  return {
    id: row.id,
    number: row.number,
    jobId: row.job_id,
    technicianId: row.technician_id,
    classification: (row.classification as TechnicianClassification | "") ?? "",
    ratePlanId: row.rate_plan_id,
    baseLaborRate: Number(row.base_labor_rate),
    additionalLabor: Number(row.additional_labor),
    extraPlumbing: Number(row.extra_plumbing),
    mileageMiles: Number(row.mileage_miles),
    mileageRate: Number(row.mileage_rate),
    materialReimbursement: Number(row.material_reimbursement),
    deductions: Number(row.deductions),
    chargebacks: Number(row.chargebacks),
    corrections: Number(row.corrections),
    regularHours: row.regular_hours != null ? Number(row.regular_hours) : undefined,
    overtimeHours: row.overtime_hours != null ? Number(row.overtime_hours) : undefined,
    notes: row.notes,
    attachments: (row.attachments as unknown as StatementAttachment[] | null) ?? [],
    status: row.status as WorkStatementStatus,
    approval: (row.approval as unknown as { by: string; at: string; note: string } | null) ?? null,
    approvalHistory: (row.approval_history as unknown as DocEvent[] | null) ?? [],
    audit: (row.audit as unknown as DocEvent[] | null) ?? [],
    paymentStatus: row.payment_status as PayableStatus,
    includedInWeeklyBatchId: row.included_in_weekly_batch_id,
    batchStatus: row.batch_status,
    approvedAt: row.approved_at,
    paidAt: row.paid_at,
    isAdjustment: row.is_adjustment,
    adjustsStatementId: row.adjusts_statement_id,
    statementType: (row.statement_type as StatementType) ?? "original",
    relatedStatementId: row.related_statement_id ?? undefined,
    typeReason: row.type_reason ?? undefined,
    supersededById: row.superseded_by_id ?? undefined,
    supersededAt: row.superseded_at ?? undefined,
    cancelled: row.cancelled ?? undefined,
    rateSnapshot: (row.rate_snapshot as unknown as RateSnapshot | null) ?? null,
    rateOverrides: (row.rate_overrides as unknown as RateOverrideLog[] | null) ?? [],
    pdfHistory: (row.pdf_history as unknown as DocPdfRecord[] | null) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function workStatementToRow(w: TechWorkStatement, companyId: string) {
  return {
    id: w.id,
    company_id: companyId,
    number: w.number,
    job_id: w.jobId,
    technician_id: w.technicianId,
    classification: w.classification || null,
    rate_plan_id: w.ratePlanId,
    base_labor_rate: w.baseLaborRate,
    additional_labor: w.additionalLabor,
    extra_plumbing: w.extraPlumbing,
    mileage_miles: w.mileageMiles,
    mileage_rate: w.mileageRate,
    material_reimbursement: w.materialReimbursement,
    deductions: w.deductions,
    chargebacks: w.chargebacks,
    corrections: w.corrections,
    regular_hours: w.regularHours ?? null,
    overtime_hours: w.overtimeHours ?? null,
    notes: w.notes,
    attachments: w.attachments,
    status: w.status,
    approval: w.approval,
    approval_history: w.approvalHistory,
    audit: w.audit,
    payment_status: w.paymentStatus,
    included_in_weekly_batch_id: w.includedInWeeklyBatchId,
    batch_status: w.batchStatus,
    approved_at: w.approvedAt,
    paid_at: w.paidAt,
    is_adjustment: w.isAdjustment,
    adjusts_statement_id: w.adjustsStatementId,
    statement_type: w.statementType,
    related_statement_id: w.relatedStatementId ?? null,
    type_reason: w.typeReason ?? null,
    superseded_by_id: w.supersededById ?? null,
    superseded_at: w.supersededAt ?? null,
    cancelled: w.cancelled ?? false,
    rate_snapshot: w.rateSnapshot,
    rate_overrides: w.rateOverrides,
    pdf_history: w.pdfHistory,
  };
}

// ─── WEEKLY TECHNICIAN STATEMENTS ────────────────────────────────────────────

export function adaptWeeklyStatement(row: Tables<"weekly_technician_statements">): WeeklyTechStatement {
  return {
    id: row.id,
    number: row.number,
    technicianId: row.technician_id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    statementIds: (row.statement_ids as string[] | null) ?? [],
    totals: (row.totals as unknown as StatementTotals | null) ?? { base: 0, extras: 0, mileage: 0, reimbursements: 0, deductions: 0, total: 0 },
    status: row.status as WeeklyStatementStatus,
    approval: (row.approval as unknown as { by: string; at: string; note: string } | null) ?? null,
    scheduledFor: row.scheduled_for,
    payments: (row.payments as unknown as WeeklyPaymentRecord[] | null) ?? [],
    paidAt: row.paid_at,
    correctionRequest: (row.correction_request as unknown as { by: string; at: string; reason: string } | null) ?? null,
    reopenings: (row.reopenings as unknown as { by: string; at: string; reason: string }[] | null) ?? [],
    audit: (row.audit as unknown as DocEvent[] | null) ?? [],
    pdfHistory: (row.pdf_history as unknown as DocPdfRecord[] | null) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function weeklyStatementToRow(w: WeeklyTechStatement, companyId: string) {
  return {
    id: w.id,
    company_id: companyId,
    number: w.number,
    technician_id: w.technicianId,
    week_start: w.weekStart,
    week_end: w.weekEnd,
    statement_ids: w.statementIds,
    totals: w.totals,
    status: w.status,
    approval: w.approval,
    scheduled_for: w.scheduledFor,
    payments: w.payments,
    paid_at: w.paidAt,
    correction_request: w.correctionRequest,
    reopenings: w.reopenings,
    audit: w.audit,
    pdf_history: w.pdfHistory,
  };
}

// ─── PAYROLL RUNS ────────────────────────────────────────────────────────────

export function adaptPayrollRun(row: Tables<"payroll_runs">): PayrollRun {
  return {
    id: row.id,
    number: row.number,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    payDate: row.pay_date,
    frequency: row.frequency as "weekly" | "biweekly",
    status: row.status as PayrollStatus,
    lines: (row.lines as unknown as PayrollLine[] | null) ?? [],
    approval: (row.approval as unknown as { by: string; at: string; note: string } | null) ?? null,
    paidAt: row.paid_at,
    audit: (row.audit as unknown as DocEvent[] | null) ?? [],
    pdfHistory: (row.pdf_history as unknown as DocPdfRecord[] | null) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function payrollRunToRow(r: PayrollRun, companyId: string) {
  return {
    id: r.id,
    company_id: companyId,
    number: r.number,
    period_start: r.periodStart,
    period_end: r.periodEnd,
    pay_date: r.payDate,
    frequency: r.frequency,
    status: r.status,
    lines: r.lines,
    approval: r.approval,
    paid_at: r.paidAt,
    audit: r.audit,
    pdf_history: r.pdfHistory,
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
    isGeneralInvoice: row.is_general_invoice ?? undefined,
    installFixedPay: row.install_fixed_pay != null ? Number(row.install_fixed_pay) : undefined,
    serviceFixedPay: row.service_fixed_pay != null ? Number(row.service_fixed_pay) : undefined,
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
    is_general_invoice: p.isGeneralInvoice ?? false,
    install_fixed_pay: p.installFixedPay ?? null,
    service_fixed_pay: p.serviceFixedPay ?? null,
  };
}
