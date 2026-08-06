import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { AgentPayout, InvoiceCalc } from "./commission-calc";
import { fmtMoney } from "./commission-calc";
import type { Company, Invoice, InvoiceTemplateId } from "./commission-store";

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

export function buildSaleInvoicePDF(
  c: InvoiceCalc,
  company: Company,
  agentName: string,
  payout?: AgentPayout | null
): jsPDF {
  const inv = c.invoice;
  const b = resolveBranding(company, inv);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const cur = b.currency;
  const tpl = b.invoiceTemplate;
  const brand = hexToRgb(b.brandColor);

  let y = drawHeader(doc, b, "SALES INVOICE", [
    `Invoice #: ${inv.number}`,
    `Date: ${inv.date}`,
    `Status: ${inv.status.toUpperCase()}`,
  ]);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("CUSTOMER", margin, y);
  doc.text("SALESPERSON", pageW / 2, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(inv.customerName || "—", margin, y + 16);
  if (inv.customerNotes) doc.text(inv.customerNotes, margin, y + 30);
  doc.text(agentName, pageW / 2, y + 16);
  if (c.financeCo) doc.text(`Finance: ${c.financeCo.name}`, pageW / 2, y + 30);

  y += tpl === "compact" ? 44 : 60;

  const fontSize = tpl === "compact" ? 9 : 10;

  autoTable(doc, {
    startY: y,
    head: [["Concept", `Amount (${cur})`]],
    body: [
      ["Sales Amount", fmtMoney(inv.salesAmount, cur)],
      ["Product Cost", fmtMoney(inv.productCost, cur)],
      [`Approval (${(inv.approvalPercent * 100).toFixed(2)}%)`, fmtMoney(c.approvalAmount, cur)],
      ["Discount", `- ${fmtMoney(inv.discount, cur)}`],
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

  const chargeRows = [...inv.charges.map((x) => [x.label, fmtMoney(x.amount, cur)])];
  if (c.financeCo) {
    if (c.financeCo.dealerFee) chargeRows.push(["Dealer fee", fmtMoney(c.financeCo.dealerFee, cur)]);
    if (c.financeCo.adminFee) chargeRows.push(["Admin fee", fmtMoney(c.financeCo.adminFee, cur)]);
    if (c.financeCo.defaultFee)
      chargeRows.push([
        `Finance fee (${(c.financeCo.defaultFee * 100).toFixed(2)}%)`,
        fmtMoney(c.financeCo.defaultFee * inv.salesAmount, cur),
      ]);
  }
  if (chargeRows.length && tpl !== "compact") {
    autoTable(doc, {
      startY: y,
      head: [["Extra Charges", `Amount (${cur})`]],
      body: chargeRows,
      foot: [["Total Charges", fmtMoney(c.totalCharges, cur)]],
      headStyles: { fillColor: [80, 80, 80], textColor: 255 },
      footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold" },
      styles: { fontSize },
      margin: { left: margin, right: margin },
      columnStyles: { 1: { halign: "right" } },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (inv.credits.length && tpl !== "compact") {
    autoTable(doc, {
      startY: y,
      head: [["Credits", `Amount (${cur})`]],
      body: inv.credits.map((x) => [x.label, fmtMoney(x.amount, cur)]),
      foot: [["Total Credits", fmtMoney(c.totalCredits, cur)]],
      headStyles: { fillColor: [60, 120, 80], textColor: 255 },
      footStyles: { fillColor: [235, 245, 235], textColor: 20, fontStyle: "bold" },
      styles: { fontSize },
      margin: { left: margin, right: margin },
      columnStyles: { 1: { halign: "right" } },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  autoTable(doc, {
    startY: y,
    body: [
      ["Approval amount", fmtMoney(c.approvalAmount, cur)],
      ["Discount", `- ${fmtMoney(inv.discount, cur)}`],
      ["Total charges", `- ${fmtMoney(c.totalCharges, cur)}`],
      ["Total credits", `+ ${fmtMoney(c.totalCredits, cur)}`],
      [
        { content: "GRAND TOTAL", styles: { fontStyle: "bold" } },
        { content: fmtMoney(c.grandTotal, cur), styles: { fontStyle: "bold" } },
      ],
      ["Product cost", `- ${fmtMoney(inv.productCost, cur)}`],
      [
        { content: "Profit (commission base)", styles: { fontStyle: "bold" } },
        { content: fmtMoney(c.profit, cur), styles: { fontStyle: "bold" } },
      ],
    ],
    theme: "plain",
    margin: { left: pageW / 2, right: margin },
    styles: { fontSize },
    columnStyles: { 1: { halign: "right" } },
  });

  if (tpl === "detailed-commission") {
    const y2 = (doc as any).lastAutoTable.finalY + 14;
    autoTable(doc, {
      startY: y2,
      head: [["Commission Detail", "Value"]],
      body: [
        ["Commission level", inv.commissionLevel || "—"],
        ["Commission base", inv.commissionBase || "profit"],
        [
          "Commission %",
          `${(((inv.commissionPercentOverride ?? 0) || 0) * 100).toFixed(2)}% (override)`,
        ],
      ],
      headStyles: { fillColor: hexToRgb(b.brandColorSecondary), textColor: 255 },
      styles: { fontSize },
      margin: { left: margin, right: margin },
      columnStyles: { 1: { halign: "right" } },
    });
  }

  if (inv.split && inv.split.participants.length > 0) {
    const y3 = (doc as any).lastAutoTable?.finalY ?? y;
    const total = inv.split.participants.reduce((sum, p) => sum + (p.splitPercent || 0), 0);
    const valid = Math.abs(total - 1) < 0.0001;
    autoTable(doc, {
      startY: y3 + 6,
      head: [["Participant", "Role", "Split %", "Share"]],
      body: inv.split.participants.map((p) => {
        const share = Math.max(0, c.commissionableBase) *
          (inv.commissionPercentOverride ?? 0) * p.splitPercent;
        return [
          p.displayName || "—",
          p.role === "custom" ? p.customRoleLabel || "Custom" : p.role,
          `${(p.splitPercent * 100).toFixed(2)}%`,
          `$${share.toFixed(2)}`,
        ];
      }),
      foot: [[
        valid ? "Split valid" : "Split INVALID",
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

  if (payout) {
    const effectiveRate = inv.commissionPercentOverride ?? payout.personalRate;
    const startY = (doc as any).lastAutoTable?.finalY ?? y;
    const rows: any[] = [
      ["Compensation level", `${inv.commissionLevel || "—"} (${(effectiveRate * 100).toFixed(2)}%)`],
      ["Personal commission", fmtMoney(payout.personalCommission, cur)],
    ];
    if (payout.overrideTotal > 0) {
      rows.push(["Downline override", fmtMoney(payout.overrideTotal, cur)]);
    }
    if (inv.advanceApplied) {
      rows.push(["Advance deducted", `- ${fmtMoney(inv.advanceApplied, cur)}`]);
    }
    if (payout.taxReserveSuggested > 0) {
      rows.push([
        `Suggested tax reserve (${((inv.taxReservePercent ?? 0) * 100).toFixed(0)}%)`,
        fmtMoney(payout.taxReserveSuggested, cur),
      ]);
    }
    autoTable(doc, {
      startY: startY + 14,
      head: [["Your Commission", ""]],
      body: rows,
      foot: [
        [
          { content: "Estimated payout", styles: { fontStyle: "bold" } },
          { content: fmtMoney(payout.finalPayable, cur), styles: { fontStyle: "bold" } },
        ],
      ],
      headStyles: { fillColor: brand, textColor: 255 },
      footStyles: { fillColor: [235, 245, 255], textColor: 20, fontStyle: "bold" },
      styles: { fontSize },
      margin: { left: margin, right: margin },
      columnStyles: { 1: { halign: "right" } },
    });
  }

  drawFooter(doc, b);
  return doc;
}

/* -------- Per-agent commission PDF -------- */

export function buildAgentCommissionPDF(
  p: AgentPayout,
  company: Company,
  invoiceDate: string,
  period: string
): jsPDF {
  const b = resolveBranding(company);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const cur = b.currency;
  const brand = hexToRgb(b.brandColor);

  let y = drawHeader(doc, b, "COMMISSION INVOICE", [
    `Date: ${invoiceDate}`,
    `Period: ${period}`,
  ]);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("PAY TO", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(p.agent.name, margin, y + 16);
  doc.text(p.agent.email || "", margin, y + 30);

  y += 60;

  if (p.invoices.length) {
    autoTable(doc, {
      startY: y,
      head: [["Invoice", "Date", "Customer", `Profit (${cur})`]],
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
    head: [["Personal commission", "Profit", "Rate", "Amount"]],
    body: [
      [
        "Sum of own profits",
        fmtMoney(p.personalProfit, cur),
        `${(p.personalRate * 100).toFixed(2)}%`,
        fmtMoney(p.personalCommission, cur),
      ],
    ],
    headStyles: { fillColor: hexToRgb(b.brandColorSecondary), textColor: 255 },
    styles: { fontSize: 9 },
    margin: { left: margin, right: margin },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  if (p.downline.length) {
    autoTable(doc, {
      startY: y,
      head: [["Downline override", "Level", "Profit", "Rate", "Override"]],
      body: p.downline.map((d) => [
        d.agent.name,
        `L${d.level}`,
        fmtMoney(d.profit, cur),
        `${(d.rate * 100).toFixed(2)}%`,
        fmtMoney(d.override, cur),
      ]),
      foot: [["Override total", "", "", "", fmtMoney(p.overrideTotal, cur)]],
      headStyles: { fillColor: hexToRgb(b.brandColorSecondary), textColor: 255 },
      footStyles: { fillColor: [235, 240, 250], textColor: 20, fontStyle: "bold" },
      styles: { fontSize: 9 },
      margin: { left: margin, right: margin },
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  autoTable(doc, {
    startY: y,
    body: [
      ["Personal commission", fmtMoney(p.personalCommission, cur)],
      ["Override commission", fmtMoney(p.overrideTotal, cur)],
      [
        { content: "Gross payout", styles: { fontStyle: "bold" } },
        { content: fmtMoney(p.grossPayout, cur), styles: { fontStyle: "bold" } },
      ],
      ["Advance applied", `- ${fmtMoney(p.advanceApplied, cur)}`],
      ["Special deductions", `- ${fmtMoney(p.specialDeductions, cur)}`],
      [
        { content: "Net payable", styles: { fontStyle: "bold" } },
        { content: fmtMoney(p.netPayable, cur), styles: { fontStyle: "bold" } },
      ],
      ["Suggested tax reserve", `- ${fmtMoney(p.taxReserveSuggested, cur)}`],
      [
        { content: "FINAL PAYABLE", styles: { fontStyle: "bold" } },
        { content: fmtMoney(p.finalPayable, cur), styles: { fontStyle: "bold" } },
      ],
      ["Pending balance", fmtMoney(p.pendingBalance, cur)],
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
  period: string
): jsPDF {
  const b = resolveBranding(company);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const cur = b.currency;
  const brand = hexToRgb(b.brandColor);
  const accent = hexToRgb(b.brandColorSecondary);

  let y = drawHeader(doc, b, "OVERRIDE COMMISSION INVOICE", [
    `Date: ${invoiceDate}`,
    `Period: ${period}`,
  ]);

  // Sponsor info block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("OVERRIDE EARNED BY", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(p.agent.name, margin, y + 16);
  doc.text(p.agent.email || "", margin, y + 30);

  y += 60;

  // Downline table
  autoTable(doc, {
    startY: y,
    head: [["Downline Rep", "Level", `Profit (${cur})`, "Override Rate", `Override (${cur})`]],
    body: p.downline.map((d) => [
      d.agent.name,
      `Level ${d.level}`,
      fmtMoney(d.profit, cur),
      `${(d.rate * 100).toFixed(2)}%`,
      fmtMoney(d.override, cur),
    ]),
    foot: [["", "", "", "Total Override", fmtMoney(p.overrideTotal, cur)]],
    headStyles: { fillColor: brand, textColor: 255 },
    footStyles: { fillColor: hexToRgb(b.brandColorSecondary), textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9 },
    margin: { left: margin, right: margin },
    columnStyles: {
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
      ["Override commission", fmtMoney(p.overrideTotal, cur)],
      [
        { content: "TOTAL PAYABLE", styles: { fontStyle: "bold" } },
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
    "This document reflects override commissions only. Personal commissions are issued separately.",
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
  period: string
) {
  for (const p of payouts) {
    if (p.grossPayout <= 0) continue;
    const doc = buildAgentCommissionPDF(p, company, invoiceDate, period);
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
  payout?: AgentPayout | null
) {
  const doc = buildSaleInvoicePDF(c, company, agentName, payout);
  doc.save(`${c.invoice.number}_${(c.invoice.customerName || "invoice").replace(/\s+/g, "_")}.pdf`);
}

export type { Invoice };
