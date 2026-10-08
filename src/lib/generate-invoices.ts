import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { AgentPayout, InvoiceCalc } from "./commission-calc";
import { fmtMoney, payeeLabel } from "./commission-calc";
import type { Company, Invoice, InvoiceTemplateId, CustomerInvoice, Lang } from "./commission-store";
import { customerInvoiceTotals } from "./commission-store";

/** Every PDF label below goes through this — the generated document follows
 * whatever language the app is currently set to, same as the rest of the UI. */
const L = (lang: Lang, en: string, es: string) => (lang === "es" ? es : en);

const hexToRgb = (hex: string): [number, number, number] => {
  const m = (hex || "#000000").replace("#", "");
  const v = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(v, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Effective branding: use snapshot if present (for old invoices), else live company. */
export type EffectiveBranding = {
  companyName: string;
  address: string;
  email: string;
  phone: string;
  taxId: string;
  currency: string;
  logoDataUrl: string;
  brandColor: string;
  brandColorSecondary: string;
  footerText: string;
  disclaimerText: string;
  invoiceTemplate: InvoiceTemplateId;
};

export function resolveBranding(company: Company, inv?: Invoice): EffectiveBranding {
  const snap = inv?.brandingSnapshot;
  if (snap) {
    return {
      companyName: snap.companyName,
      address: snap.address,
      email: snap.email,
      phone: snap.phone,
      taxId: snap.taxId,
      currency: snap.currency,
      logoDataUrl: snap.logoDataUrl,
      brandColor: snap.brandColor,
      brandColorSecondary: snap.brandColorSecondary,
      footerText: snap.footerText,
      disclaimerText: snap.disclaimerText,
      invoiceTemplate: snap.invoiceTemplate,
    };
  }
  return {
    companyName: company.name,
    address: company.address,
    email: company.email,
    phone: company.phone,
    taxId: company.taxId,
    currency: company.currency,
    logoDataUrl: company.logoDataUrl || "",
    brandColor: company.brandColor || "#232D5A",
    brandColorSecondary: company.brandColorSecondary || "#4F6BFF",
    footerText: company.footerText || "",
    disclaimerText: company.disclaimerText || "",
    invoiceTemplate: company.invoiceTemplate || "classic",
  };
}

/** Snapshot to persist on an invoice when its PDF is generated. */
export function makeBrandingSnapshot(company: Company): NonNullable<Invoice["brandingSnapshot"]> {
  return {
    companyName: company.name,
    address: company.address,
    email: company.email,
    phone: company.phone,
    taxId: company.taxId,
    currency: company.currency,
    logoDataUrl: company.logoDataUrl || "",
    brandColor: company.brandColor || "#232D5A",
    brandColorSecondary: company.brandColorSecondary || "#4F6BFF",
    footerText: company.footerText || "",
    disclaimerText: company.disclaimerText || "",
    invoiceTemplate: company.invoiceTemplate || "classic",
  };
}

export const INVOICE_TEMPLATES: { id: InvoiceTemplateId; name: string; desc: string }[] = [
  { id: "classic", name: "Classic", desc: "Bold colored header with full breakdown." },
  { id: "modern-finance", name: "Modern Finance", desc: "Two-tone gradient bar, finance-forward layout." },
  { id: "compact", name: "Compact", desc: "Single-page, tighter spacing for high volume." },
  { id: "detailed-commission", name: "Detailed Commission", desc: "Adds an itemized commission breakdown panel." },
  { id: "minimal", name: "Minimal", desc: "Black-and-white, typographic, no header fill." },
];

function drawHeader(
  doc: jsPDF,
  b: EffectiveBranding,
  title: string,
  rightLines: string[]
) {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const brand = hexToRgb(b.brandColor);
  const accent = hexToRgb(b.brandColorSecondary);
  const tpl = b.invoiceTemplate;

  let headerH = 90;
  if (tpl === "compact") headerH = 64;
  if (tpl === "minimal") headerH = 70;
  if (tpl === "detailed-commission") headerH = 96;

  if (tpl === "minimal") {
    // No fill; bottom rule only
    doc.setDrawColor(...brand);
    doc.setLineWidth(2);
    doc.line(margin, headerH - 6, pageW - margin, headerH - 6);
    doc.setTextColor(20);
  } else if (tpl === "modern-finance") {
    // Two-tone bar
    doc.setFillColor(...brand);
    doc.rect(0, 0, pageW, headerH, "F");
    doc.setFillColor(...accent);
    doc.rect(0, headerH - 8, pageW, 8, "F");
    doc.setTextColor(255);
  } else {
    doc.setFillColor(...brand);
    doc.rect(0, 0, pageW, headerH, "F");
    doc.setTextColor(255);
  }

  // Logo
  let textX = margin;
  if (b.logoDataUrl) {
    try {
      const fmt = b.logoDataUrl.includes("image/png") ? "PNG" : "JPEG";
      const size = tpl === "compact" ? 36 : 50;
      doc.addImage(b.logoDataUrl, fmt, margin, (headerH - size) / 2, size, size);
      textX = margin + size + 12;
    } catch {
      /* ignore bad image */
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(tpl === "compact" ? 16 : tpl === "minimal" ? 22 : 20);
  doc.text(title, textX, tpl === "compact" ? 28 : 36);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(tpl === "compact" ? 8 : 10);
  if (tpl !== "minimal") {
    doc.text(b.companyName, textX, tpl === "compact" ? 44 : 56);
    doc.text(b.address, textX, tpl === "compact" ? 54 : 70);
    doc.text(`${b.phone}  ·  ${b.email}`, textX, tpl === "compact" ? 62 : 84);
  } else {
    doc.setTextColor(60);
    doc.text(`${b.companyName}  ·  ${b.address}`, textX, 36);
    doc.text(`${b.phone}  ·  ${b.email}`, textX, 50);
  }

  // Right column
  const rightX = pageW - margin;
  rightLines.forEach((line, i) => {
    doc.text(line, rightX, (tpl === "compact" ? 28 : 36) + i * 14, { align: "right" });
  });

  doc.setTextColor(20);
  return headerH + (tpl === "compact" ? 16 : 30);
}

function drawFooter(doc: jsPDF, b: EffectiveBranding) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  doc.setFontSize(8);
  doc.setTextColor(120);
  if (b.footerText) doc.text(b.footerText, margin, pageH - 32);
  if (b.disclaimerText) {
    const lines = doc.splitTextToSize(b.disclaimerText, pageW - margin * 2);
    doc.text(lines, margin, pageH - 18);
  }
}

/* -------- Per-invoice (sale) PDF -------- */

export type InvoiceInvolvedRow = {
  name: string; role: string; amount: number; agentId?: string | null;
  grossAmount?: number;
  deductions?: { id: string; label: string; amount: number }[];
};

/** Builds the body rows for a "who gets paid" table. A person with no
 *  discount is one row as always; a person with one or more discounts
 *  becomes its own mini breakdown — initial amount, one line per discount
 *  reason, then a bold Total — instead of cramming the reason into the
 *  Role cell next to an already-discounted figure. */
function involvedRowsToTableBody(rows: InvoiceInvolvedRow[], cur: string, lang: Lang = "en"): any[] {
  const body: any[] = [];
  for (const r of rows) {
    if (r.deductions && r.deductions.length > 0) {
      body.push([r.name, r.role, fmtMoney(r.grossAmount ?? r.amount, cur)]);
      for (const d of r.deductions) {
        body.push(["", d.label, `- ${fmtMoney(d.amount, cur)}`]);
      }
      body.push([
        "",
        { content: L(lang, "Total", "Total"), styles: { fontStyle: "bold" } },
        { content: fmtMoney(r.amount, cur), styles: { fontStyle: "bold" } },
      ]);
    } else {
      body.push([r.name, r.role, fmtMoney(r.amount, cur)]);
    }
  }
  return body;
}

const EXTRA_LABELS: Record<string, string> = {
  mileage: "Mileage",
  materials: "Materials",
  construction: "Construction",
  electrical: "Electrical work",
  other: "Other",
};
const EXTRA_LABELS_ES: Record<string, string> = {
  mileage: "Millaje",
  materials: "Materiales",
  construction: "Construcción",
  electrical: "Trabajo eléctrico",
  other: "Otro",
};
const extraLabel = (category: string, lang: Lang) =>
  (lang === "es" ? EXTRA_LABELS_ES : EXTRA_LABELS)[category] ?? category;

export function buildSaleInvoicePDF(
  c: InvoiceCalc,
  company: Company,
  agentName: string,
  payout?: AgentPayout | null,
  involved?: InvoiceInvolvedRow[],
  commissionEntryMode: "fixed" | "percent" = "percent",
  lang: Lang = "en"
): jsPDF {
  const inv = c.invoice;
  const b = resolveBranding(company, inv);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const cur = b.currency;
  const tpl = b.invoiceTemplate;
  const brand = hexToRgb(b.brandColor);

  let y = drawHeader(doc, b, L(lang, "SALES INVOICE", "FACTURA DE VENTA"), [
    `${L(lang, "Invoice #", "Factura #")}: ${inv.number}`,
    `${L(lang, "Date", "Fecha")}: ${inv.date}`,
    `${L(lang, "Status", "Estado")}: ${inv.status.toUpperCase()}`,
  ]);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(L(lang, "CUSTOMER", "CLIENTE"), margin, y);
  doc.text(L(lang, "SALESPERSON", "VENDEDOR"), pageW / 2, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(inv.customerName || "—", margin, y + 16);
  if (inv.customerNotes) doc.text(inv.customerNotes, margin, y + 30);
  doc.text(agentName, pageW / 2, y + 16);
  if (c.financeCo) doc.text(`${L(lang, "Finance", "Financiera")}: ${c.financeCo.name}`, pageW / 2, y + 30);

  y += tpl === "compact" ? 44 : 60;

  const fontSize = tpl === "compact" ? 9 : 10;

  // General invoices (flat pay per job — subcontractors like plumbers) skip
  // the whole sale/product-cost/charges model entirely.
  if (inv.isGeneralInvoice) {
    autoTable(doc, {
      startY: y,
      head: [[L(lang, "Job details", "Detalles del trabajo"), `${L(lang, "Amount", "Monto")} (${cur})`]],
      body: [
        [L(lang, "Type", "Tipo"), inv.jobType === "service" ? L(lang, "Service", "Servicio") : L(lang, "Installation", "Instalación")],
        [L(lang, "Fixed pay", "Pago fijo"), fmtMoney(inv.fixedPay || 0, cur)],
        ...(inv.extras || []).map((x) => [extraLabel(x.category, lang), fmtMoney(x.amount, cur)]),
      ],
      foot: (inv.extras && inv.extras.length)
        ? [[L(lang, "Total", "Total"), fmtMoney((inv.fixedPay || 0) + inv.extras.reduce((s, x) => s + (x.amount || 0), 0), cur)]]
        : undefined,
      footStyles: { fillColor: [235, 245, 255], textColor: 20, fontStyle: "bold" },
      headStyles:
        tpl === "minimal"
          ? { fillColor: [240, 240, 240], textColor: 20 }
          : { fillColor: brand, textColor: 255 },
      styles: { fontSize },
      margin: { left: margin, right: margin },
      columnStyles: { 1: { halign: "right" } },
    });
    y = (doc as any).lastAutoTable.finalY + 20;

    const showInvolvedTableGI =
      involved && involved.length > 0 &&
      !(involved.length === 1 && involved[0].agentId === inv.agentId);
    if (showInvolvedTableGI) {
      autoTable(doc, {
        startY: y,
        head: [[L(lang, "Who gets paid on this sale", "Quién cobra en esta venta"), L(lang, "Role", "Rol"), `${L(lang, "Amount", "Monto")} (${cur})`]],
        body: involvedRowsToTableBody(involved!, cur, lang),
        headStyles: { fillColor: brand, textColor: 255 },
        styles: { fontSize },
        margin: { left: margin, right: margin },
        columnStyles: { 2: { halign: "right" } },
      });
    }

    const sellerRowGI = involved?.find((r) => r.agentId === inv.agentId);
    if (sellerRowGI && inv.taxReservePercent) {
      const reserveAmt = Math.max(0, sellerRowGI.amount) * inv.taxReservePercent;
      const yNote = (doc as any).lastAutoTable?.finalY ?? y;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(90);
      doc.text(
        L(lang,
          `Recommendation: set aside ${(inv.taxReservePercent * 100).toFixed(0)}% for taxes — that's ${fmtMoney(reserveAmt, cur)}.`,
          `Recomendación: aparta ${(inv.taxReservePercent * 100).toFixed(0)}% para impuestos — son ${fmtMoney(reserveAmt, cur)}.`),
        margin,
        yNote + 16
      );
      doc.setTextColor(0);
    }

    drawFooter(doc, b);
    return doc;
  }

  autoTable(doc, {
    startY: y,
    head: [[L(lang, "Concept", "Concepto"), `${L(lang, "Amount", "Monto")} (${cur})`]],
    body: [
      [L(lang, "Sales Amount", "Monto de venta"), fmtMoney(inv.salesAmount, cur)],
      [L(lang, "Product Cost", "Costo del producto"), fmtMoney(inv.productCost, cur)],
      [`${L(lang, "Approval", "Aprobación")} (${(inv.approvalPercent * 100).toFixed(2)}%)`, fmtMoney(c.approvalAmount, cur)],
    ],
    headStyles:
      tpl === "minimal"
        ? { fillColor: [240, 240, 240], textColor: 20 }
        : { fillColor: brand, textColor: 255 },
    styles: { fontSize },
    margin: { left: margin, right: margin },
    columnStyles: { 1: { halign: "right" } },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // Every component that feeds into c.totalCharges must appear here as its
  // own row — otherwise the printed total doesn't reconcile with what's shown.
  // These (plus the discount) come out of the seller's commission, same as
  // the admin fee — so the itemized table prints further down, next to the
  // other commission deductions, instead of up by the sale amount.
  const chargeRows = [...inv.charges.map((x) => [x.label, fmtMoney(x.amount, cur)])];
  const effectiveDealerFee = inv.dealerFee != null ? inv.dealerFee : c.financeCo?.dealerFee ?? 0;
  if (effectiveDealerFee) chargeRows.push([L(lang, "Dealer fee", "Tarifa del dealer"), fmtMoney(effectiveDealerFee, cur)]);
  if (c.financeCo?.adminFee) chargeRows.push([L(lang, "Finance admin fee", "Tarifa admin de financiera"), fmtMoney(c.financeCo.adminFee, cur)]);
  if (c.financeCo?.defaultFee)
    chargeRows.push([
      `${L(lang, "Finance fee", "Tarifa de financiera")} (${(c.financeCo.defaultFee * 100).toFixed(2)}%)`,
      fmtMoney(c.financeCo.defaultFee * inv.salesAmount, cur),
    ]);
  if (inv.saleType === "credit_card") {
    const ccpfPct = inv.ccpfPercent ?? 0.035;
    chargeRows.push([
      `C.C.P.F. (${(ccpfPct * 100).toFixed(2)}%)`,
      fmtMoney(inv.salesAmount * ccpfPct, cur),
    ]);
  }

  if (inv.credits.length && tpl !== "compact") {
    autoTable(doc, {
      startY: y,
      head: [[L(lang, "Credits", "Créditos"), `${L(lang, "Amount", "Monto")} (${cur})`]],
      body: inv.credits.map((x) => [x.label, fmtMoney(x.amount, cur)]),
      foot: [[L(lang, "Total Credits", "Total créditos"), fmtMoney(c.totalCredits, cur)]],
      headStyles: { fillColor: [60, 120, 80], textColor: 255 },
      footStyles: { fillColor: [235, 245, 235], textColor: 20, fontStyle: "bold" },
      styles: { fontSize },
      margin: { left: margin, right: margin },
      columnStyles: { 1: { halign: "right" } },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  const summaryRows: any[] = [
    [L(lang, "Approval amount", "Monto de aprobación"), fmtMoney(c.approvalAmount, cur)],
    [L(lang, "Discount", "Descuento"), `- ${fmtMoney(inv.discount, cur)}`],
    [L(lang, "Total charges", "Total cargos"), `- ${fmtMoney(c.totalCharges, cur)}`],
    [L(lang, "Total credits", "Total créditos"), `+ ${fmtMoney(c.totalCredits, cur)}`],
    [
      { content: L(lang, "GRAND TOTAL", "TOTAL GENERAL"), styles: { fontStyle: "bold" } },
      { content: fmtMoney(c.grandTotal, cur), styles: { fontStyle: "bold" } },
    ],
    [L(lang, "Product cost", "Costo del producto"), `- ${fmtMoney(inv.productCost, cur)}`],
    [
      { content: L(lang, "Profit", "Profit"), styles: { fontStyle: "bold" } },
      { content: fmtMoney(c.profit, cur), styles: { fontStyle: "bold" } },
    ],
  ];
  if (c.adminFeeAmount > 0) {
    summaryRows.push([L(lang, "Admin fee (1%)", "Tarifa admin (1%)"), `- ${fmtMoney(c.adminFeeAmount, cur)}`]);
    summaryRows.push([
      { content: L(lang, "Profit after admin fee", "Profit después de tarifa admin"), styles: { fontStyle: "bold" } },
      { content: fmtMoney(c.profit - c.adminFeeAmount, cur), styles: { fontStyle: "bold" } },
    ]);
  }
  autoTable(doc, {
    startY: y,
    body: summaryRows,
    theme: "plain",
    margin: { left: pageW / 2, right: margin },
    styles: { fontSize },
    columnStyles: { 1: { halign: "right" } },
  });
  y = (doc as any).lastAutoTable.finalY + 14;

  // Itemized detail for "Total charges" above — printed down here, next to
  // the admin fee, since these come out of the commission just like it does,
  // not out of the sale amount.
  if (chargeRows.length && tpl !== "compact") {
    autoTable(doc, {
      startY: y,
      head: [[L(lang, "Charges detail", "Detalle de cargos"), `${L(lang, "Amount", "Monto")} (${cur})`]],
      body: chargeRows,
      foot: [[L(lang, "Total Charges", "Total cargos"), fmtMoney(c.totalCharges, cur)]],
      headStyles: { fillColor: [80, 80, 80], textColor: 255 },
      footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold" },
      styles: { fontSize },
      margin: { left: margin, right: margin },
      columnStyles: { 1: { halign: "right" } },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (inv.split && inv.split.participants.length > 0) {
    const y3 = (doc as any).lastAutoTable?.finalY ?? y;
    const total = inv.split.participants.reduce((sum, p) => sum + (p.splitPercent || 0), 0);
    const valid = Math.abs(total - 1) < 0.0001;
    autoTable(doc, {
      startY: y3 + 6,
      head: [[L(lang, "Participant", "Participante"), L(lang, "Role", "Rol"), L(lang, "Split %", "% Split"), L(lang, "Share", "Parte")]],
      body: inv.split.participants.map((p) => {
        const raw = inv.commissionPercentOverride != null
          ? Math.max(0, c.commissionableBase) * inv.commissionPercentOverride
          : commissionEntryMode === "fixed"
            ? Math.max(0, c.commissionableBase)
            : 0;
        const pool = Math.max(0, raw - c.adminFeeAmount);
        const share = pool * p.splitPercent;
        return [
          p.displayName || "—",
          p.role === "custom" ? p.customRoleLabel || L(lang, "Custom", "Personalizado") : p.role,
          `${(p.splitPercent * 100).toFixed(2)}%`,
          `$${share.toFixed(2)}`,
        ];
      }),
      foot: [[
        valid ? L(lang, "Split valid", "Split válido") : L(lang, "Split INVALID", "Split INVÁLIDO"),
        "",
        `${(total * 100).toFixed(2)}%`,
        "",
      ]],
      headStyles: { fillColor: hexToRgb(b.brandColorSecondary), textColor: 255 },
      footStyles: {
        fillColor: valid ? [240, 253, 244] : [254, 226, 226],
        textColor: valid ? 30 : 153,
      },
      styles: { fontSize },
      margin: { left: margin, right: margin },
    });
  }

  // When scoped down to a single person who IS the seller, the "SALESPERSON"
  // field above already says whose document this is — repeating them in a
  // one-row "who gets paid" table is redundant. Only show the table when it
  // lists more than one person, or when the sole row belongs to someone else
  // (e.g. an upline sponsor's override statement).
  const showInvolvedTable =
    involved && involved.length > 0 &&
    !(involved.length === 1 && involved[0].agentId === inv.agentId);
  if (showInvolvedTable) {
    const y4 = (doc as any).lastAutoTable?.finalY ?? y;
    autoTable(doc, {
      startY: y4 + 14,
      head: [[L(lang, "Who gets paid on this sale", "Quién cobra en esta venta"), L(lang, "Role", "Rol"), `${L(lang, "Amount", "Monto")} (${cur})`]],
      body: involvedRowsToTableBody(involved!, cur, lang),
      headStyles: { fillColor: brand, textColor: 255 },
      styles: { fontSize },
      margin: { left: margin, right: margin },
      columnStyles: { 2: { halign: "right" } },
    });
  }

  // Same tax-reserve recommendation shown in the commission explain
  // dialog — a suggestion only, so it's the one place a % still shows up.
  const sellerRow = involved?.find((r) => r.agentId === inv.agentId);
  if (sellerRow && inv.taxReservePercent) {
    const reserveAmt = Math.max(0, sellerRow.amount) * inv.taxReservePercent;
    const y5 = (doc as any).lastAutoTable?.finalY ?? y;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(
      L(lang,
        `Recommendation: set aside ${(inv.taxReservePercent * 100).toFixed(0)}% for taxes — that's ${fmtMoney(reserveAmt, cur)}.`,
        `Recomendación: aparta ${(inv.taxReservePercent * 100).toFixed(0)}% para impuestos — son ${fmtMoney(reserveAmt, cur)}.`),
      margin,
      y5 + 16
    );
    doc.setTextColor(0);
  }

  drawFooter(doc, b);
  return doc;
}

/* -------- Customer-facing cash invoice/receipt --------
 * A totally different document from everything above: no commission
 * breakdown, no "who gets paid" — just what the customer bought, what
 * they've paid so far (abonos), and what's left. Matches the paper
 * receipt format the company already hands customers who pay cash in
 * installments. */
export function buildCashCustomerInvoicePDF(inv: Invoice, company: Company, lang: Lang = "en"): jsPDF {
  const b = resolveBranding(company, inv);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const cur = b.currency;
  const brand = hexToRgb(b.brandColor);
  const brand2 = hexToRgb(b.brandColorSecondary);

  // ── Header: logo/company left, "NO. X · INVOICE" right ──
  let logoBottom = margin;
  if (b.logoDataUrl) {
    try {
      const fmt = b.logoDataUrl.includes("image/png") ? "PNG" : "JPEG";
      doc.addImage(b.logoDataUrl, fmt, margin, margin, 60, 60);
      logoBottom = margin + 60;
    } catch {
      /* ignore bad image */
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20);
  doc.text(b.companyName, margin, logoBottom + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text(b.address, margin, logoBottom + 28);
  if (b.taxId) doc.text(`EIN # ${b.taxId}`, margin, logoBottom + 39);
  doc.text(b.email, margin, logoBottom + 50);
  doc.text(`${L(lang, "Phone", "Teléfono")}: ${b.phone}`, margin, logoBottom + 61);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text(`${L(lang, "NO.", "NO.")} ${inv.number}`, pageW - margin, margin + 12, { align: "right" });
  doc.setFontSize(22);
  doc.text(L(lang, "INVOICE", "FACTURA"), pageW - margin, margin + 34, { align: "right" });

  let y = logoBottom + 90;

  // ── Date / Billed to ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20);
  doc.text(`${L(lang, "Date", "Fecha")}:`, margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(inv.date, margin + 36, y);
  y += 22;

  doc.setFont("helvetica", "bold");
  doc.text(`${L(lang, "Billed to", "Facturar a")}:`, margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.text(inv.customerName || "—", margin, y);
  y += 14;
  if (inv.customerAddress) {
    doc.text(inv.customerAddress, margin, y);
    y += 14;
  }
  if (inv.customerPhone) {
    doc.text(`${L(lang, "Phone", "Teléfono")}: ${inv.customerPhone}`, margin, y);
    y += 14;
  }
  y += 12;

  // ── Item table: main item + any extra charges as additional lines ──
  const itemRows: (string | number)[][] = [
    [inv.invoiceItemLabel || L(lang, "Product/Service", "Producto/Servicio"), "1", fmtMoney(inv.salesAmount, cur), fmtMoney(inv.salesAmount, cur)],
    ...inv.charges.map((c) => [c.label || "—", "1", fmtMoney(c.amount, cur), fmtMoney(c.amount, cur)]),
  ];
  autoTable(doc, {
    startY: y,
    head: [[L(lang, "Item", "Artículo"), L(lang, "Quantity", "Cantidad"), L(lang, "Price", "Precio"), L(lang, "Amount", "Monto")]],
    body: itemRows,
    headStyles: { fillColor: [235, 235, 235], textColor: 20 },
    styles: { fontSize: 10 },
    margin: { left: margin, right: margin },
    columnStyles: { 1: { halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" } },
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  const total = inv.salesAmount + inv.charges.reduce((s, c) => s + Number(c.amount || 0), 0);
  const paid = (inv.customerPayments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
  const balance = Math.max(0, total - paid);

  autoTable(doc, {
    startY: y,
    body: [
      [{ content: L(lang, "TOTAL", "TOTAL"), styles: { fontStyle: "bold" } }, { content: fmtMoney(total, cur), styles: { fontStyle: "bold" } }],
      [L(lang, "PAID", "PAGADO"), fmtMoney(paid, cur)],
      [{ content: L(lang, "BALANCE", "SALDO"), styles: { fontStyle: "bold" } }, { content: fmtMoney(balance, cur), styles: { fontStyle: "bold" } }],
    ],
    theme: "plain",
    margin: { left: pageW / 2, right: margin },
    styles: { fontSize: 11 },
    columnStyles: { 1: { halign: "right" } },
  });
  y = (doc as any).lastAutoTable.finalY + 24;

  // ── Payment method / history ──
  const payments = inv.customerPayments || [];
  if (payments.length || inv.paymentPlanNote) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20);
    doc.text(`${L(lang, "Payment method", "Método de pago")}:`, margin, y);
    y += 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    for (const p of payments) {
      doc.text(`${p.label}  ${fmtMoney(p.amount, cur)}   ${p.date}`, margin, y);
      y += 15;
    }
    if (inv.paymentPlanNote) {
      y += 6;
      const lines = doc.splitTextToSize(inv.paymentPlanNote, pageW - margin * 2 - 40);
      doc.text(lines, margin, y);
      y += lines.length * 14;
    }
  }

  // ── Decorative wave footer, brand two-tone ──
  const waveH = 90;
  doc.setFillColor(...brand2);
  doc.ellipse(pageW * 0.25, pageH + waveH * 0.3, pageW * 0.55, waveH * 1.3, "F");
  doc.setFillColor(...brand);
  doc.ellipse(pageW * 0.85, pageH + waveH * 0.5, pageW * 0.5, waveH * 1.1, "F");

  return doc;
}

/* -------- Full customer invoice (Billing & Technician Payables, Phase 1) --------
 * The richer, status-driven successor to buildCashCustomerInvoicePDF above —
 * real line items, billing vs. service address, due date, discount/tax/
 * deposit/financing, payment terms, warranty. Still never touches the
 * master invoice's commission fields; everything here is read from the
 * CustomerInvoice document plus display-only branding off the master
 * Invoice/Company. */
const CUSTOMER_INVOICE_STATUS_ES: Record<string, string> = {
  draft: "borrador", sent: "enviado", viewed: "visto", partially_paid: "parcialmente pagado",
  paid: "pagado", overdue: "vencido", cancelled: "cancelado", refunded: "reembolsado",
};

export function buildCustomerInvoicePDF(ci: CustomerInvoice, inv: Invoice, company: Company, lang: Lang = "en"): jsPDF {
  const b = resolveBranding(company, inv);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const cur = b.currency;
  const brand = hexToRgb(b.brandColor);
  const brand2 = hexToRgb(b.brandColorSecondary);

  let logoBottom = margin;
  if (b.logoDataUrl) {
    try {
      const fmt = b.logoDataUrl.includes("image/png") ? "PNG" : "JPEG";
      doc.addImage(b.logoDataUrl, fmt, margin, margin, 60, 60);
      logoBottom = margin + 60;
    } catch {
      /* ignore bad image */
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20);
  doc.text(b.companyName, margin, logoBottom + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text(b.address, margin, logoBottom + 28);
  if (b.taxId) doc.text(`EIN # ${b.taxId}`, margin, logoBottom + 39);
  doc.text(b.email, margin, logoBottom + 50);
  doc.text(`${L(lang, "Phone", "Teléfono")}: ${b.phone}`, margin, logoBottom + 61);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text(`${L(lang, "NO.", "NO.")} ${ci.number}`, pageW - margin, margin + 12, { align: "right" });
  doc.setFontSize(22);
  doc.text(L(lang, "INVOICE", "FACTURA"), pageW - margin, margin + 34, { align: "right" });
  if (ci.status !== "draft" && ci.status !== "sent" && ci.status !== "viewed") {
    doc.setFontSize(10);
    const statusColor: [number, number, number] = ci.status === "paid" ? [16, 122, 87] : [190, 60, 40];
    doc.setTextColor(...statusColor);
    const statusLabel = lang === "es" ? (CUSTOMER_INVOICE_STATUS_ES[ci.status] ?? ci.status) : ci.status.replace("_", " ");
    doc.text(statusLabel.toUpperCase(), pageW - margin, margin + 48, { align: "right" });
    doc.setTextColor(20);
  }

  let y = logoBottom + 90;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`${L(lang, "Invoice date", "Fecha de factura")}:`, margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(ci.invoiceDate, margin + 68, y);
  if (ci.dueDate) {
    doc.setFont("helvetica", "bold");
    doc.text(`${L(lang, "Due date", "Fecha de vencimiento")}:`, pageW / 2, y);
    doc.setFont("helvetica", "normal");
    doc.text(ci.dueDate, pageW / 2 + 56, y);
  }
  y += 24;

  doc.setFont("helvetica", "bold");
  doc.text(`${L(lang, "Billed to", "Facturar a")}:`, margin, y);
  if (ci.serviceAddress && ci.serviceAddress !== ci.billingAddress) doc.text(`${L(lang, "Service address", "Dirección de servicio")}:`, pageW / 2, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.text(ci.customerName || "—", margin, y);
  if (ci.serviceAddress && ci.serviceAddress !== ci.billingAddress) doc.text(ci.serviceAddress, pageW / 2, y);
  y += 14;
  if (ci.billingAddress) {
    doc.text(ci.billingAddress, margin, y);
    y += 14;
  }
  y += 10;

  const { lineTotal, total, paid, balance } = customerInvoiceTotals(ci);

  autoTable(doc, {
    startY: y,
    head: [[L(lang, "Item", "Artículo"), L(lang, "Quantity", "Cantidad"), L(lang, "Unit Price", "Precio unitario"), L(lang, "Amount", "Monto")]],
    body: ci.lineItems.map((li) => [li.label, String(li.quantity), fmtMoney(li.unitPrice, cur), fmtMoney(li.quantity * li.unitPrice, cur)]),
    headStyles: { fillColor: [235, 235, 235], textColor: 20 },
    styles: { fontSize: 10 },
    margin: { left: margin, right: margin },
    columnStyles: { 1: { halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" } },
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  const summaryRows: any[] = [[L(lang, "Subtotal", "Subtotal"), fmtMoney(lineTotal, cur)]];
  if (ci.discount) summaryRows.push([L(lang, "Discount", "Descuento"), `- ${fmtMoney(ci.discount, cur)}`]);
  if (ci.taxPercent) summaryRows.push([`${L(lang, "Tax", "Impuesto")} (${(ci.taxPercent * 100).toFixed(2)}%)`, fmtMoney(lineTotal * ci.taxPercent, cur)]);
  if (ci.deposit) summaryRows.push([L(lang, "Deposit", "Depósito"), `- ${fmtMoney(ci.deposit, cur)}`]);
  if (ci.financingApplied) summaryRows.push([L(lang, "Financing applied", "Financiamiento aplicado"), `- ${fmtMoney(ci.financingApplied, cur)}`]);
  summaryRows.push([{ content: L(lang, "TOTAL", "TOTAL"), styles: { fontStyle: "bold" } }, { content: fmtMoney(total, cur), styles: { fontStyle: "bold" } }]);
  summaryRows.push([L(lang, "PAID", "PAGADO"), fmtMoney(paid, cur)]);
  summaryRows.push([{ content: L(lang, "BALANCE DUE", "SALDO PENDIENTE"), styles: { fontStyle: "bold" } }, { content: fmtMoney(balance, cur), styles: { fontStyle: "bold" } }]);

  autoTable(doc, {
    startY: y,
    body: summaryRows,
    theme: "plain",
    margin: { left: pageW / 2, right: margin },
    styles: { fontSize: 10 },
    columnStyles: { 1: { halign: "right" } },
  });
  y = (doc as any).lastAutoTable.finalY + 20;

  if (ci.paymentTerms) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(20);
    doc.text(`${L(lang, "Payment terms", "Términos de pago")}:`, margin, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(ci.paymentTerms, pageW - margin * 2 - 90);
    doc.text(lines, margin + 90, y);
    y += Math.max(14, lines.length * 12) + 8;
  }

  if (ci.payments.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20);
    doc.text(`${L(lang, "Payment history", "Historial de pagos")}:`, margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    for (const p of ci.payments) {
      doc.text(`${fmtMoney(p.amount, cur)}   ${p.date}   ${p.method}${p.reference ? ` · ${p.reference}` : ""}`, margin, y);
      y += 14;
    }
    y += 6;
  }

  if (ci.warrantyInfo) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`${L(lang, "Warranty", "Garantía")}:`, margin, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(ci.warrantyInfo, pageW - margin * 2 - 60);
    doc.text(lines, margin + 60, y);
    y += Math.max(14, lines.length * 12) + 8;
  }

  if (ci.notes) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(90);
    const lines = doc.splitTextToSize(ci.notes, pageW - margin * 2);
    doc.text(lines, margin, y);
  }

  const waveH = 90;
  doc.setFillColor(...brand2);
  doc.ellipse(pageW * 0.25, pageH + waveH * 0.3, pageW * 0.55, waveH * 1.3, "F");
  doc.setFillColor(...brand);
  doc.ellipse(pageW * 0.85, pageH + waveH * 0.5, pageW * 0.5, waveH * 1.1, "F");

  return doc;
}

/** "Generate Receipt" — a short pay-to-date summary, not the full invoice. */
export function buildCustomerReceiptPDF(ci: CustomerInvoice, inv: Invoice, company: Company, lang: Lang = "en"): jsPDF {
  const b = resolveBranding(company, inv);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const cur = b.currency;
  const brand = hexToRgb(b.brandColor);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20);
  doc.text(b.companyName, margin, margin + 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text(b.address, margin, margin + 22);
  doc.text(`${b.phone}  ·  ${b.email}`, margin, margin + 33);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(20);
  doc.text(L(lang, "PAYMENT RECEIPT", "RECIBO DE PAGO"), pageW - margin, margin + 20, { align: "right" });
  doc.setFontSize(10);
  doc.text(`${L(lang, "Invoice", "Factura")} ${ci.number}`, pageW - margin, margin + 36, { align: "right" });

  let y = margin + 70;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${L(lang, "Customer", "Cliente")}: ${ci.customerName || "—"}`, margin, y);
  y += 24;

  const { total, paid, balance } = customerInvoiceTotals(ci);

  autoTable(doc, {
    startY: y,
    head: [[L(lang, "Date", "Fecha"), L(lang, "Method", "Método"), L(lang, "Reference", "Referencia"), `${L(lang, "Amount", "Monto")} (${cur})`]],
    body: ci.payments.map((p) => [p.date, p.method, p.reference || "—", fmtMoney(p.amount, cur)]),
    foot: [["", "", L(lang, "Total paid", "Total pagado"), fmtMoney(paid, cur)]],
    headStyles: { fillColor: brand, textColor: 255 },
    footStyles: { fillColor: [235, 245, 255], textColor: 20, fontStyle: "bold" },
    styles: { fontSize: 10 },
    margin: { left: margin, right: margin },
    columnStyles: { 3: { halign: "right" } },
  });
  y = (doc as any).lastAutoTable.finalY + 20;

  autoTable(doc, {
    startY: y,
    body: [
      [L(lang, "Invoice total", "Total de factura"), fmtMoney(total, cur)],
      [L(lang, "Paid to date", "Pagado a la fecha"), fmtMoney(paid, cur)],
      [{ content: L(lang, "Remaining balance", "Saldo restante"), styles: { fontStyle: "bold" } }, { content: fmtMoney(balance, cur), styles: { fontStyle: "bold" } }],
    ],
    theme: "plain",
    margin: { left: pageW / 2, right: margin },
    styles: { fontSize: 10 },
    columnStyles: { 1: { halign: "right" } },
  });

  return doc;
}

/* -------- Per-agent commission PDF -------- */

export function buildAgentCommissionPDF(
  p: AgentPayout,
  company: Company,
  invoiceDate: string,
  period: string,
  commissionEntryMode: "fixed" | "percent" = "percent",
  lang: Lang = "en"
): jsPDF {
  const isFixed = commissionEntryMode === "fixed";
  const b = resolveBranding(company);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const cur = b.currency;
  const brand = hexToRgb(b.brandColor);

  let y = drawHeader(doc, b, L(lang, "COMMISSION INVOICE", "FACTURA DE COMISIÓN"), [
    `${L(lang, "Date", "Fecha")}: ${invoiceDate}`,
    `${L(lang, "Period", "Periodo")}: ${period}`,
  ]);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(L(lang, "PAY TO", "PAGAR A"), margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(payeeLabel(p.agent), margin, y + 16);
  doc.text(p.agent.email || "", margin, y + 30);

  y += 60;

  if (p.invoices.length) {
    autoTable(doc, {
      startY: y,
      head: [[L(lang, "Invoice", "Factura"), L(lang, "Date", "Fecha"), L(lang, "Customer", "Cliente"), `Profit (${cur})`]],
      body: p.invoices.map((c) => [
        c.invoice.number,
        c.invoice.date,
        c.invoice.customerName || "—",
        fmtMoney(c.profit, cur),
      ]),
      headStyles: { fillColor: brand, textColor: 255 },
      styles: { fontSize: 9 },
      margin: { left: margin, right: margin },
      columnStyles: { 3: { halign: "right" } },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  autoTable(doc, {
    startY: y,
    head: isFixed
      ? [[L(lang, "Personal commission", "Comisión personal"), L(lang, "Amount", "Monto")]]
      : [[L(lang, "Personal commission", "Comisión personal"), "Profit", L(lang, "Rate", "Tarifa"), L(lang, "Amount", "Monto")]],
    body: isFixed
      ? [[L(lang, "Sale minus product cost minus fee", "Venta menos costo del producto menos tarifa"), fmtMoney(p.personalCommission, cur)]]
      : [
          [
            L(lang, "Sum of own profits", "Suma de profits propios"),
            fmtMoney(p.personalProfit, cur),
            `${(p.personalRate * 100).toFixed(2)}%`,
            fmtMoney(p.personalCommission, cur),
          ],
        ],
    headStyles: { fillColor: hexToRgb(b.brandColorSecondary), textColor: 255 },
    styles: { fontSize: 9 },
    margin: { left: margin, right: margin },
    columnStyles: isFixed
      ? { 1: { halign: "right" } }
      : { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  if (p.downline.length) {
    autoTable(doc, {
      startY: y,
      head: isFixed
        ? [[L(lang, "Downline override", "Override de downline"), L(lang, "Level", "Nivel"), L(lang, "Override", "Override")]]
        : [[L(lang, "Downline override", "Override de downline"), L(lang, "Level", "Nivel"), "Profit", L(lang, "Rate", "Tarifa"), L(lang, "Override", "Override")]],
      body: p.downline.map((d) =>
        isFixed
          ? [d.agent.name, `L${d.level}`, fmtMoney(d.override, cur)]
          : [
              d.agent.name,
              `L${d.level}`,
              fmtMoney(d.profit, cur),
              `${(d.rate * 100).toFixed(2)}%`,
              fmtMoney(d.override, cur),
            ]
      ),
      foot: isFixed
        ? [[L(lang, "Override total", "Total override"), "", fmtMoney(p.overrideTotal, cur)]]
        : [[L(lang, "Override total", "Total override"), "", "", "", fmtMoney(p.overrideTotal, cur)]],
      headStyles: { fillColor: hexToRgb(b.brandColorSecondary), textColor: 255 },
      footStyles: { fillColor: [235, 240, 250], textColor: 20, fontStyle: "bold" },
      styles: { fontSize: 9 },
      margin: { left: margin, right: margin },
      columnStyles: isFixed
        ? { 2: { halign: "right" } }
        : { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  autoTable(doc, {
    startY: y,
    body: [
      [L(lang, "Personal commission", "Comisión personal"), fmtMoney(p.personalCommission, cur)],
      [L(lang, "Override commission", "Comisión override"), fmtMoney(p.overrideTotal, cur)],
      [
        { content: L(lang, "Gross payout", "Pago bruto"), styles: { fontStyle: "bold" } },
        { content: fmtMoney(p.grossPayout, cur), styles: { fontStyle: "bold" } },
      ],
      [L(lang, "Advance applied", "Avance aplicado"), `- ${fmtMoney(p.advanceApplied, cur)}`],
      [L(lang, "Special deductions", "Deducciones especiales"), `- ${fmtMoney(p.specialDeductions, cur)}`],
      [
        { content: L(lang, "Net payable", "Neto a pagar"), styles: { fontStyle: "bold" } },
        { content: fmtMoney(p.netPayable, cur), styles: { fontStyle: "bold" } },
      ],
      [L(lang, "Suggested tax reserve", "Reserva de impuestos sugerida"), `- ${fmtMoney(p.taxReserveSuggested, cur)}`],
      [
        { content: L(lang, "FINAL PAYABLE", "PAGO FINAL"), styles: { fontStyle: "bold" } },
        { content: fmtMoney(p.finalPayable, cur), styles: { fontStyle: "bold" } },
      ],
      [L(lang, "Pending balance", "Saldo pendiente"), fmtMoney(p.pendingBalance, cur)],
    ],
    theme: "plain",
    margin: { left: pageW / 2, right: margin },
    styles: { fontSize: 10 },
    columnStyles: { 1: { halign: "right" } },
  });

  drawFooter(doc, b);
  return doc;
}

/* -------- Sponsor override PDF (dedicated document) -------- */

export function buildOverridePDF(
  p: AgentPayout,
  company: Company,
  invoiceDate: string,
  period: string,
  commissionEntryMode: "fixed" | "percent" = "percent",
  lang: Lang = "en"
): jsPDF {
  const isFixed = commissionEntryMode === "fixed";
  const b = resolveBranding(company);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const cur = b.currency;
  const brand = hexToRgb(b.brandColor);
  const accent = hexToRgb(b.brandColorSecondary);

  let y = drawHeader(doc, b, L(lang, "OVERRIDE COMMISSION INVOICE", "FACTURA DE COMISIÓN OVERRIDE"), [
    `${L(lang, "Date", "Fecha")}: ${invoiceDate}`,
    `${L(lang, "Period", "Periodo")}: ${period}`,
  ]);

  // Sponsor info block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(L(lang, "OVERRIDE EARNED BY", "OVERRIDE GANADO POR"), margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(payeeLabel(p.agent), margin, y + 16);
  doc.text(p.agent.email || "", margin, y + 30);

  y += 60;

  // Downline table
  autoTable(doc, {
    startY: y,
    head: isFixed
      ? [[L(lang, "Downline Rep", "Rep downline"), L(lang, "Level", "Nivel"), `${L(lang, "Override", "Override")} (${cur})`]]
      : [[L(lang, "Downline Rep", "Rep downline"), L(lang, "Level", "Nivel"), `Profit (${cur})`, L(lang, "Override Rate", "Tarifa override"), `${L(lang, "Override", "Override")} (${cur})`]],
    body: p.downline.map((d) =>
      isFixed
        ? [d.agent.name, `${L(lang, "Level", "Nivel")} ${d.level}`, fmtMoney(d.override, cur)]
        : [
            d.agent.name,
            `${L(lang, "Level", "Nivel")} ${d.level}`,
            fmtMoney(d.profit, cur),
            `${(d.rate * 100).toFixed(2)}%`,
            fmtMoney(d.override, cur),
          ]
    ),
    foot: isFixed
      ? [["", L(lang, "Total Override", "Total Override"), fmtMoney(p.overrideTotal, cur)]]
      : [["", "", "", L(lang, "Total Override", "Total Override"), fmtMoney(p.overrideTotal, cur)]],
    headStyles: { fillColor: brand, textColor: 255 },
    footStyles: { fillColor: hexToRgb(b.brandColorSecondary), textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9 },
    margin: { left: margin, right: margin },
    columnStyles: isFixed
      ? { 2: { halign: "right" } }
      : {
          2: { halign: "right" },
          3: { halign: "right" },
          4: { halign: "right" },
        },
  });
  y = (doc as any).lastAutoTable.finalY + 20;

  // Summary box (right-aligned, minimal)
  autoTable(doc, {
    startY: y,
    body: [
      [L(lang, "Override commission", "Comisión override"), fmtMoney(p.overrideTotal, cur)],
      [
        { content: L(lang, "TOTAL PAYABLE", "TOTAL A PAGAR"), styles: { fontStyle: "bold" } },
        { content: fmtMoney(p.overrideTotal, cur), styles: { fontStyle: "bold" } },
      ],
    ],
    theme: "plain",
    margin: { left: pageW / 2, right: margin },
    styles: { fontSize: 10 },
    columnStyles: { 1: { halign: "right" } },
  });

  // Separator note
  y = (doc as any).lastAutoTable.finalY + 16;
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(
    L(lang,
      "This document reflects override commissions only. Personal commissions are issued separately.",
      "Este documento refleja solo comisiones override. Las comisiones personales se emiten por separado."),
    margin,
    y,
    { maxWidth: pageW - margin * 2 }
  );

  drawFooter(doc, b);
  return doc;
}

export function downloadAllCommissionPDFs(
  payouts: AgentPayout[],
  company: Company,
  invoiceDate: string,
  period: string,
  commissionEntryMode: "fixed" | "percent" = "percent",
  lang: Lang = "en"
) {
  for (const p of payouts) {
    if (p.grossPayout <= 0) continue;
    const doc = buildAgentCommissionPDF(p, company, invoiceDate, period, commissionEntryMode, lang);
    doc.save(`commission_${p.agent.name.replace(/\s+/g, "_")}.pdf`);
  }
}

export function downloadSummary(
  payouts: AgentPayout[],
  company: Company,
  period: string
) {
  const cur = company.currency;
  const rows = payouts.map((p) => ({
    Agent: p.agent.name,
    Email: p.agent.email,
    "Personal Profit": +p.personalProfit.toFixed(2),
    "Rate %": +(p.personalRate * 100).toFixed(2),
    "Admin Fee (1%)": +p.invoices.reduce((sum, c) => sum + c.adminFeeAmount, 0).toFixed(2),
    "Personal Commission": +p.personalCommission.toFixed(2),
    "Override Total": +p.overrideTotal.toFixed(2),
    "Gross Payout": +p.grossPayout.toFixed(2),
    "Advance Applied": +p.advanceApplied.toFixed(2),
    "Special Deductions": +p.specialDeductions.toFixed(2),
    "Net Payable": +p.netPayable.toFixed(2),
    "Tax Reserve": +p.taxReserveSuggested.toFixed(2),
    "Final Payable": +p.finalPayable.toFixed(2),
    "Pending Balance": +p.pendingBalance.toFixed(2),
    Currency: cur,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Commission Summary");
  XLSX.writeFile(wb, `commission-summary-${period.replace(/\s+/g, "_")}.xlsx`);
}

export function buildSaleAndDownload(
  c: InvoiceCalc,
  company: Company,
  agentName: string,
  payout?: AgentPayout | null,
  involved?: InvoiceInvolvedRow[],
  commissionEntryMode: "fixed" | "percent" = "percent",
  lang: Lang = "en"
) {
  const doc = buildSaleInvoicePDF(c, company, agentName, payout, involved, commissionEntryMode, lang);
  doc.save(`${c.invoice.number}_${(c.invoice.customerName || "invoice").replace(/\s+/g, "_")}.pdf`);
}

/* -------- Per-invoice payout documents: one private statement per
   person, plus a consolidated master summary for accounting -------- */

/** A private one-page statement for a single person's share of a single
 *  sale — doesn't expose what anyone else on the deal earned. */
export function buildInvoicePayoutStatementPDF(
  row: InvoiceInvolvedRow,
  c: InvoiceCalc,
  company: Company,
  taxReservePercent?: number,
  lang: Lang = "en"
): jsPDF {
  const inv = c.invoice;
  const b = resolveBranding(company, inv);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const cur = b.currency;
  const brand = hexToRgb(b.brandColor);

  let y = drawHeader(doc, b, L(lang, "PAYOUT STATEMENT", "ESTADO DE PAGO"), [
    `${L(lang, "Invoice #", "Factura #")}: ${inv.number}`,
    `${L(lang, "Date", "Fecha")}: ${inv.date}`,
  ]);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(L(lang, "PAY TO", "PAGAR A"), margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(row.name, margin, y + 16);
  doc.text(row.role, margin, y + 30);

  y += 60;

  const reserve = Math.max(0, row.amount) * (taxReservePercent || 0);
  const final = row.amount - reserve;
  const rows: any[] = [
    [L(lang, "Customer", "Cliente"), inv.customerName || "—"],
    [L(lang, "Your share of this sale", "Tu parte de esta venta"), fmtMoney(row.grossAmount ?? row.amount, cur)],
  ];
  for (const ded of row.deductions || []) {
    rows.push([ded.label, `- ${fmtMoney(ded.amount, cur)}`]);
  }
  if (taxReservePercent)
    rows.push([`${L(lang, "Suggested tax reserve", "Reserva de impuestos sugerida")} (${(taxReservePercent * 100).toFixed(0)}%)`, `- ${fmtMoney(reserve, cur)}`]);

  autoTable(doc, {
    startY: y,
    body: rows,
    foot: [
      [
        { content: L(lang, "Final amount", "Monto final"), styles: { fontStyle: "bold" } },
        { content: fmtMoney(final, cur), styles: { fontStyle: "bold" } },
      ],
    ],
    theme: "plain",
    styles: { fontSize: 10 },
    margin: { left: margin, right: margin },
    columnStyles: { 1: { halign: "right" } },
    footStyles: { fillColor: [235, 245, 255], textColor: 20, fontStyle: "bold" },
    headStyles: { fillColor: brand, textColor: 255 },
  });

  drawFooter(doc, b);
  return doc;
}

/** One consolidated document listing everyone who gets paid on this sale —
 *  for accounting/admin use, not for handing to an individual rep. */
export function buildInvoiceMasterSummaryPDF(
  rows: InvoiceInvolvedRow[],
  c: InvoiceCalc,
  company: Company,
  lang: Lang = "en"
): jsPDF {
  const inv = c.invoice;
  const b = resolveBranding(company, inv);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const cur = b.currency;
  const brand = hexToRgb(b.brandColor);

  drawHeader(doc, b, L(lang, "MASTER TRANSACTION SUMMARY", "RESUMEN MAESTRO DE TRANSACCIÓN"), [
    `${L(lang, "Invoice #", "Factura #")}: ${inv.number}`,
    `${L(lang, "Date", "Fecha")}: ${inv.date}`,
  ]);

  let y = 110;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${L(lang, "Customer", "Cliente")}: ${inv.customerName || "—"}`, margin, y);
  doc.text(`${L(lang, "Sales amount", "Monto de venta")}: ${fmtMoney(inv.salesAmount, cur)}`, margin, y + 16);

  y += 46;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  autoTable(doc, {
    startY: y,
    head: [[L(lang, "Name", "Nombre"), L(lang, "Role", "Rol"), `${L(lang, "Amount", "Monto")} (${cur})`]],
    body: involvedRowsToTableBody(rows, cur, lang),
    foot: [["", L(lang, "Total payout", "Total pagado"), fmtMoney(total, cur)]],
    headStyles: { fillColor: brand, textColor: 255 },
    footStyles: { fillColor: [235, 245, 255], textColor: 20, fontStyle: "bold" },
    styles: { fontSize: 10 },
    margin: { left: margin, right: margin },
    columnStyles: { 2: { halign: "right" } },
  });

  drawFooter(doc, b);
  return doc;
}

/** "Generate All" — one private PDF per person on this sale. */
export function downloadAllInvoiceStatements(
  rows: InvoiceInvolvedRow[],
  c: InvoiceCalc,
  company: Company,
  taxReservePercent?: number,
  lang: Lang = "en"
) {
  for (const row of rows) {
    const doc = buildInvoicePayoutStatementPDF(row, c, company, taxReservePercent, lang);
    doc.save(`${c.invoice.number}_${row.name.replace(/\s+/g, "_")}_statement.pdf`);
  }
}

export function downloadInvoiceMasterSummary(
  rows: InvoiceInvolvedRow[],
  c: InvoiceCalc,
  company: Company,
  lang: Lang = "en"
) {
  const doc = buildInvoiceMasterSummaryPDF(rows, c, company, lang);
  doc.save(`${c.invoice.number}_master_summary.pdf`);
}

/** One invoice's worth of rows for the period-wide master summary below. */
export type InvoiceSummarySection = {
  invoiceNumber: string;
  date: string;
  customerName: string;
  salesAmount: number;
  rows: InvoiceInvolvedRow[];
};

/** Same "MASTER TRANSACTION SUMMARY" look as buildInvoiceMasterSummaryPDF,
 *  extended to cover every sale in a period instead of just one — one
 *  sub-table per invoice, paginating as needed, with a grand total at the
 *  end. This is what "Generate All" produces for the whole period. */
export function buildPeriodMasterSummaryPDF(
  sections: InvoiceSummarySection[],
  company: Company,
  periodLabel: string,
  lang: Lang = "en"
): jsPDF {
  const b = resolveBranding(company);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const cur = b.currency;
  const brand = hexToRgb(b.brandColor);
  const pageH = doc.internal.pageSize.getHeight();
  const title = L(lang, "MASTER TRANSACTION SUMMARY", "RESUMEN MAESTRO DE TRANSACCIÓN");
  const headerLines = [`${L(lang, "Period", "Periodo")}: ${periodLabel}`, `${sections.length} ${L(lang, "invoice(s)", "factura(s)")}`];

  drawHeader(doc, b, title, headerLines);
  let y = 110;
  let grandTotal = 0;

  for (const sec of sections) {
    if (y > pageH - 170) {
      drawFooter(doc, b);
      doc.addPage();
      drawHeader(doc, b, title, headerLines);
      y = 110;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`${L(lang, "Invoice #", "Factura #")}: ${sec.invoiceNumber}   ·   ${L(lang, "Date", "Fecha")}: ${sec.date}`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${L(lang, "Customer", "Cliente")}: ${sec.customerName || "—"}   ·   ${L(lang, "Sales amount", "Monto de venta")}: ${fmtMoney(sec.salesAmount, cur)}`, margin, y + 14);
    y += 24;

    const total = sec.rows.reduce((s, r) => s + r.amount, 0);
    grandTotal += total;
    autoTable(doc, {
      startY: y,
      head: [[L(lang, "Name", "Nombre"), L(lang, "Role", "Rol"), `${L(lang, "Amount", "Monto")} (${cur})`]],
      body: involvedRowsToTableBody(sec.rows, cur, lang),
      foot: [["", L(lang, "Subtotal", "Subtotal"), fmtMoney(total, cur)]],
      headStyles: { fillColor: brand, textColor: 255 },
      footStyles: { fillColor: [235, 245, 255], textColor: 20, fontStyle: "bold" },
      styles: { fontSize: 9 },
      margin: { left: margin, right: margin },
      columnStyles: { 2: { halign: "right" } },
    });
    y = (doc as any).lastAutoTable.finalY + 26;
  }

  if (y > pageH - 90) {
    drawFooter(doc, b);
    doc.addPage();
    drawHeader(doc, b, title, headerLines);
    y = 110;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`${L(lang, "Grand total payout", "Total general pagado")}: ${fmtMoney(grandTotal, cur)}`, margin, y);

  drawFooter(doc, b);
  return doc;
}

export function downloadPeriodMasterSummary(
  sections: InvoiceSummarySection[],
  company: Company,
  periodLabel: string,
  filenameHint: string,
  lang: Lang = "en"
) {
  const doc = buildPeriodMasterSummaryPDF(sections, company, periodLabel, lang);
  doc.save(`${filenameHint}_master_summary.pdf`);
}

export type { Invoice };
