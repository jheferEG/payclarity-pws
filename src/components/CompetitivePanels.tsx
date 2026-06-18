import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Wand2, Upload, CheckCircle2, ArrowRight, ArrowLeft, Settings2, Sparkles, FileDown } from "lucide-react";
import { useStore, type AdjustmentKind, type Invoice } from "@/lib/commission-store";
import { fmtMoney, calcInvoice } from "@/lib/commission-calc";
import { labelFor } from "@/lib/ledger";
import { INVOICE_TEMPLATES, buildSaleAndDownload } from "@/lib/generate-invoices";
import { useT } from "@/lib/i18n";

/* ===================================================================
   ADJUSTMENT / CORRECTION CENTER
   Unified place for advances, deductions, credits, chargebacks,
   manual overrides, payment & split corrections, pending-balance fixes.
   Every entry feeds the Balance Ledger via the store.
   =================================================================== */

const KINDS: { value: AdjustmentKind; label: string; desc: string }[] = [
  { value: "advance", label: "Advance", desc: "Money paid up-front to a rep, deducted later." },
  { value: "deduction", label: "Deduction", desc: "Reduces the rep's payable balance." },
  { value: "credit", label: "Credit / bonus", desc: "Adds to the rep's payable balance." },
  { value: "chargeback", label: "Chargeback", desc: "Sale fell through, claw back commission." },
  { value: "manual_override", label: "Manual override", desc: "Discretionary upline override." },
  { value: "payment_correction", label: "Payment correction", desc: "Fix an over/under payment." },
  { value: "split_correction", label: "Split correction", desc: "Re-split commission across reps." },
  { value: "pending_balance", label: "Pending balance", desc: "Move money into pending balance." },
];

export function AdjustmentsPanel() {
  const s = useStore();
  const isAdmin = s.role === "admin";
  const [form, setForm] = useState({
    agentId: "",
    invoiceId: "",
    kind: "advance" as AdjustmentKind,
    amount: 0,
    date: new Date().toISOString().slice(0, 10),
    note: "",
  });

  if (!isAdmin) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Only admins can post adjustments. Reps can request corrections from the Approvals tab.
        </p>
      </Card>
    );
  }

  const submit = () => {
    if (!form.agentId) return toast.error("Pick a salesperson");
    if (!form.amount || form.amount <= 0) return toast.error("Amount must be positive");
    s.addAdjustment({
      agentId: form.agentId,
      invoiceId: form.invoiceId || null,
      kind: form.kind,
      amount: Number(form.amount),
      date: form.date,
      note: form.note.trim(),
      createdBy: "admin",
    });
    toast.success("Adjustment recorded");
    setForm({ ...form, amount: 0, note: "", invoiceId: "" });
  };

  const recent = s.adjustments.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <Card className="p-6 shadow-card space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Settings2 className="w-5 h-5" /> Adjustment & Correction Center
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          One place for every advance, deduction, credit, chargeback, manual override and payment
          correction. Every entry is logged in each rep's Balance Ledger.
        </p>
      </div>

      <div className="grid md:grid-cols-6 gap-3 p-4 bg-muted/40 rounded-lg">
        <div className="md:col-span-2">
          <Label>Salesperson</Label>
          <Select value={form.agentId} onValueChange={(v) => setForm({ ...form, agentId: v })}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {s.agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label>Type</Label>
          <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as AdjustmentKind })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">
            {KINDS.find((k) => k.value === form.kind)?.desc}
          </p>
        </div>
        <div>
          <Label>Amount</Label>
          <Input type="number" step="0.01" value={form.amount}
            onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Date</Label>
          <Input type="date" value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>

        <div className="md:col-span-3">
          <Label>Related invoice (optional)</Label>
          <Select value={form.invoiceId || "none"} onValueChange={(v) => setForm({ ...form, invoiceId: v === "none" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {s.invoices
                .filter((i) => !form.agentId || i.agentId === form.agentId)
                .map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.number} · {i.customerName}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-3">
          <Label>Note</Label>
          <Input value={form.note} placeholder="e.g. Q1 advance, customer cancelled, payroll correction…"
            onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <div className="md:col-span-6">
          <Button onClick={submit}><Plus className="w-4 h-4 mr-2" />Post adjustment</Button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Recent adjustments</h3>
        {recent.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-lg">
            No adjustments yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="py-2">Date</th><th>Salesperson</th><th>Type</th>
                  <th className="text-right">Amount</th><th>Invoice</th><th>Note</th><th></th>
                </tr>
              </thead>
              <tbody>
                {recent.map((a) => {
                  const ag = s.agents.find((x) => x.id === a.agentId);
                  const inv = a.invoiceId ? s.invoices.find((x) => x.id === a.invoiceId) : null;
                  return (
                    <tr key={a.id} className="border-t border-border/60">
                      <td className="py-2 font-mono text-xs">{a.date}</td>
                      <td>{ag?.name ?? "—"}</td>
                      <td>{labelFor(a.kind)}</td>
                      <td className="text-right font-mono">{fmtMoney(a.amount, s.company.currency)}</td>
                      <td className="font-mono text-xs">{inv?.number ?? "—"}</td>
                      <td className="text-muted-foreground">{a.note}</td>
                      <td className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => s.removeAdjustment(a.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ===================================================================
   CSV INVOICE IMPORT
   Accepted columns (header row required, case-insensitive):
   date, customer, salesperson, sales_amount, product_cost,
   approval_percent, finance_company, discount, advance, deduction
   =================================================================== */

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let val = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { val += '"'; i++; }
      else if (ch === '"') { q = false; }
      else { val += ch; }
    } else if (ch === '"') q = true;
    else if (ch === ",") { cur.push(val); val = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (val.length || cur.length) { cur.push(val); rows.push(cur); cur = []; val = ""; }
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else val += ch;
  }
  if (val.length || cur.length) { cur.push(val); rows.push(cur); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return rows.slice(1).filter((r) => r.some((c) => c.trim() !== "")).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = (r[i] ?? "").trim(); });
    return o;
  });
}

export function CsvImportPanel() {
  const s = useStore();
  const isAdmin = s.role === "admin";
  const [preview, setPreview] = useState<Omit<Invoice, "id" | "number">[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  if (!isAdmin) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Only admins can import invoices.</p>
      </Card>
    );
  }

  const handleFile = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    const errs: string[] = [];
    const out: Omit<Invoice, "id" | "number">[] = [];
    const agentByName = new Map(s.agents.map((a) => [a.name.toLowerCase(), a]));
    const financeByName = new Map(s.financeCompanies.map((f) => [f.name.toLowerCase(), f]));

    rows.forEach((r, idx) => {
      const agName = (r.salesperson || r.agent || "").toLowerCase();
      const ag = agentByName.get(agName);
      if (!ag) {
        errs.push(`Row ${idx + 2}: salesperson "${r.salesperson || r.agent}" not found.`);
        return;
      }
      const fcName = (r.finance_company || r.finance || "").toLowerCase();
      const fc = fcName ? financeByName.get(fcName) : null;

      out.push({
        date: r.date || new Date().toISOString().slice(0, 10),
        status: "draft",
        agentId: ag.id,
        financeCompanyId: fc?.id ?? null,
        customerName: r.customer || r.customer_name || "",
        customerNotes: r.notes || "",
        salesAmount: Number(r.sales_amount || r.sales || 0),
        productCost: Number(r.product_cost || r.cost || 0),
        approvalPercent: Number(r.approval_percent || 100) / 100,
        discount: Number(r.discount || 0),
        charges: [],
        credits: [],
        advanceApplied: Number(r.advance || 0),
        specialDeductions: Number(r.deduction || 0),
        taxReservePercent: Number(r.tax_reserve_percent || 20) / 100,
        paid: false,
      });
    });

    setErrors(errs);
    setPreview(out);
    if (out.length) toast.success(`${out.length} invoice(s) ready to import`);
    else toast.error("No valid rows found");
  };

  const confirm = () => {
    if (!preview.length) return;
    const n = s.importInvoices(preview);
    toast.success(`Imported ${n} invoice(s)`);
    setPreview([]);
    setErrors([]);
  };

  const downloadTemplate = () => {
    const csv =
      "date,customer,salesperson,sales_amount,product_cost,approval_percent,finance_company,discount,advance,deduction\n" +
      "2025-01-15,John Smith,Jane Doe,12500,7000,100,,0,0,0\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "invoices-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-6 shadow-card space-y-5">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Upload className="w-5 h-5" /> Import invoices from CSV
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          No CRM required. Upload a CSV and we'll create invoices in bulk.
          Required columns: <code className="text-xs">date, customer, salesperson, sales_amount, product_cost</code>.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={downloadTemplate}>Download CSV template</Button>
        <label className="inline-flex">
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ""; }}
          />
          <span className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium cursor-pointer">
            <Upload className="w-4 h-4 mr-2" /> Choose CSV
          </span>
        </label>
        {preview.length > 0 && (
          <Button onClick={confirm}>Import {preview.length} invoice(s)</Button>
        )}
      </div>

      {errors.length > 0 && (
        <div className="text-xs text-destructive space-y-1">
          {errors.map((e, i) => <div key={i}>• {e}</div>)}
        </div>
      )}

      {preview.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground uppercase tracking-wider">
              <tr><th className="py-2">Date</th><th>Customer</th><th>Salesperson</th>
                <th className="text-right">Sales</th><th className="text-right">Cost</th></tr>
            </thead>
            <tbody>
              {preview.map((p, i) => {
                const ag = s.agents.find((a) => a.id === p.agentId);
                return (
                  <tr key={i} className="border-t border-border/60">
                    <td className="py-2 font-mono text-xs">{p.date}</td>
                    <td>{p.customerName}</td>
                    <td>{ag?.name}</td>
                    <td className="text-right font-mono">{fmtMoney(p.salesAmount, s.company.currency)}</td>
                    <td className="text-right font-mono">{fmtMoney(p.productCost, s.company.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ===================================================================
   SETUP WIZARD
   Guided 8-step onboarding. Each step writes through to the store so
   the user's selections immediately apply to the real workflow.
   Progress (current step, completed steps, completed flag) is persisted.
   =================================================================== */


export function SetupWizard({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const t = useT();
  const [step, setStep] = useState(0);

  const [agentDraft, setAgentDraft] = useState({ name: "", email: "", commissionPercent: "8", level: "Sales Rep" });
  const [financeDraft, setFinanceDraft] = useState({ name: "", defaultFee: 0.05, dealerFee: 0, adminFee: 0 });
  const [tierRate, setTierRate] = useState(8);
  const [ovRate, setOvRate] = useState(2);

  const STEPS = [
    t("wiz_step_company"),
    t("wiz_step_branding"),
    t("wiz_step_team"),
    t("wiz_step_plan"),
    t("wiz_step_finance"),
    t("wiz_step_splits"),
    t("wiz_step_advances"),
    t("wiz_step_test"),
  ];
  const TOTAL = STEPS.length;

  const next = () => setStep((p) => Math.min(TOTAL - 1, p + 1));
  const back = () => setStep((p) => Math.max(0, p - 1));

  const finish = () => {
    s.completeWizard();
    toast.success(t("wiz_ready"));
    onClose();
  };

  const generateTest = () => {
    let inv = s.invoices[0];
    if (!inv) { s.loadDemoData(); inv = useStore.getState().invoices[0]; }
    if (!inv) { toast.error(t("err_pdf")); return; }
    try {
      const fcs = useStore.getState().financeCompanies;
      const company = useStore.getState().company;
      const agents = useStore.getState().agents;
      const c = calcInvoice(inv, fcs);
      const agentName = agents.find((a) => a.id === inv!.agentId)?.name || "—";
      buildSaleAndDownload(c, company, agentName);
      toast.success(t("success_pdf"));
    } catch (e: any) {
      toast.error(e?.message || t("err_pdf"));
    }
  };

  const es = s.language === "es";

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-lg p-6 shadow-elegant max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <Wand2 className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-semibold">{t("wiz_title")}</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          {t("wiz_step")} {step + 1} {t("wiz_of")} {TOTAL}:{" "}
          <span className="font-medium text-foreground">{STEPS[step]}</span>
        </p>

        {/* Progress bar */}
        <div className="h-1.5 bg-muted rounded-full mb-4 overflow-hidden">
          <div className="h-full bg-gradient-cta transition-all duration-300"
            style={{ width: `${((step + 1) / TOTAL) * 100}%` }} />
        </div>

        {/* Step dots */}
        <div className="flex gap-1.5 mb-5 justify-center">
          {STEPS.map((_, i) => (
            <button key={i} onClick={() => setStep(i)}
              className={`h-2 rounded-full transition-all ${i === step ? "w-6 bg-accent" : i < step ? "w-2 bg-accent/40" : "w-2 bg-muted"}`}
            />
          ))}
        </div>

        {/* ── Paso 0: Perfil de la compañía ── */}
        {step === 0 && (
          <div className="grid gap-3">
            <div><Label>{t("lbl_company_name")}</Label>
              <Input value={s.company.name} onChange={(e) => s.setCompany({ name: e.target.value })} placeholder="Mi Empresa LLC" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("lbl_currency")}</Label>
                <Select value={s.company.currency} onValueChange={(v) => s.setCompany({ currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["USD","EUR","GBP","CAD","AUD","MXN","BRL"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{t("lbl_invoice_prefix")}</Label>
                <Input value={s.company.invoicePrefix} onChange={(e) => s.setCompany({ invoicePrefix: e.target.value })} placeholder="INV-" />
              </div>
            </div>
            <div><Label>{t("lbl_billing_email")}</Label>
              <Input type="email" value={s.company.email} onChange={(e) => s.setCompany({ email: e.target.value })} />
            </div>
            <div><Label>{t("lbl_address")}</Label>
              <Input value={s.company.address} onChange={(e) => s.setCompany({ address: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("lbl_phone")}</Label>
                <Input value={s.company.phone} onChange={(e) => s.setCompany({ phone: e.target.value })} />
              </div>
              <div><Label>{t("lbl_tax_id")}</Label>
                <Input value={s.company.taxId} onChange={(e) => s.setCompany({ taxId: e.target.value })} />
              </div>
            </div>
          </div>
        )}

        {/* ── Paso 1: Marca y plantilla ── */}
        {step === 1 && (
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">{t("sect_company_desc")}</p>
            <div className="flex items-center gap-4">
              <div>
                <Label>{t("lbl_brand_color")}</Label>
                <div className="flex items-center gap-2 mt-1">
                  <input type="color" value={s.company.brandColor}
                    onChange={(e) => s.setCompany({ brandColor: e.target.value })}
                    className="h-10 w-14 rounded-lg border-2 border-sky-200 cursor-pointer p-0.5" />
                  <span className="text-xs font-mono text-muted-foreground">{s.company.brandColor}</span>
                </div>
              </div>
              <div className="flex-1">
                <Label>{t("lbl_invoice_prefix")}</Label>
                <Input value={s.company.invoicePrefix}
                  onChange={(e) => s.setCompany({ invoicePrefix: e.target.value })} placeholder="INV-" />
              </div>
            </div>
            <div>
              <Label>{t("wiz_template_pick")}</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {INVOICE_TEMPLATES.map((tpl) => (
                  <button key={tpl.id}
                    onClick={() => s.setCompany({ pdfTemplate: tpl.id } as any)}
                    className={`p-3 rounded-xl border-2 text-xs font-medium transition-all ${(s.company as any).pdfTemplate === tpl.id ? "border-accent bg-sky-50 text-accent" : "border-border hover:border-sky-300 text-foreground"}`}
                  >
                    {tpl.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Paso 2: Equipo de ventas ── */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("sect_team_desc")}</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("lbl_name")} *</Label>
                <Input value={agentDraft.name}
                  onChange={(e) => setAgentDraft({ ...agentDraft, name: e.target.value })} placeholder="Ana López" />
              </div>
              <div><Label>{t("lbl_email")}</Label>
                <Input value={agentDraft.email}
                  onChange={(e) => setAgentDraft({ ...agentDraft, email: e.target.value })} placeholder="ana@empresa.com" />
              </div>
              <div><Label>{t("lbl_commission_pct")} *</Label>
                <Input type="number" step="0.1" value={agentDraft.commissionPercent}
                  onChange={(e) => setAgentDraft({ ...agentDraft, commissionPercent: e.target.value })} placeholder="8" />
              </div>
              <div><Label>{t("lbl_level")}</Label>
                <Select value={agentDraft.level} onValueChange={(v) => setAgentDraft({ ...agentDraft, level: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Junior Rep">Junior Rep</SelectItem>
                    <SelectItem value="Sales Rep">Sales Rep</SelectItem>
                    <SelectItem value="Senior Rep">Senior Rep</SelectItem>
                    <SelectItem value="Manager">Manager</SelectItem>
                    <SelectItem value="Director">Director</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => {
              if (!agentDraft.name.trim()) return toast.error(t("err_name_required"));
              s.addAgent({
                name: agentDraft.name.trim(), email: agentDraft.email.trim(),
                sponsorId: null,
                commissionPercent: Number(agentDraft.commissionPercent) / 100 || 0.08,
                level: agentDraft.level,
              });
              setAgentDraft({ name: "", email: "", commissionPercent: "8", level: "Sales Rep" });
              toast.success(t("success_rep_added"));
            }}>
              <Plus className="w-3 h-3 mr-2" />{t("btn_add")}
            </Button>
            {s.agents.length > 0 && (
              <div className="text-xs text-muted-foreground bg-sky-50 rounded-lg px-3 py-2">
                ✓ {s.agents.map((a) => a.name).join(", ")}
              </div>
            )}
          </div>
        )}

        {/* ── Paso 3: Plan de compensación ── */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("sect_tiers_desc")}</p>
            <div className="bg-sky-50 rounded-xl p-4 space-y-2">
              <Label className="text-xs font-semibold">{t("sect_tiers")}</Label>
              <div className="flex items-center gap-3">
                <Input type="number" step="0.1" className="w-28"
                  value={tierRate} onChange={(e) => setTierRate(Number(e.target.value))} />
                <span className="text-sm text-muted-foreground">%</span>
                <Button variant="outline" size="sm" onClick={() => {
                  s.setPersonalTiers([{ minVolume: 0, rate: tierRate / 100 }]);
                  toast.success("✓");
                }}>{t("btn_save")}</Button>
              </div>
              {s.personalTiers.length > 0 && (
                <p className="text-xs text-accent">✓ {(s.personalTiers[0].rate * 100).toFixed(1)}% {es ? "configurado" : "set"}</p>
              )}
            </div>
            <div className="bg-sky-50 rounded-xl p-4 space-y-2">
              <Label className="text-xs font-semibold">{t("sect_overrides")} — {es ? "Nivel 1" : "Level 1"}</Label>
              <p className="text-xs text-muted-foreground">{t("sect_overrides_desc")}</p>
              <div className="flex items-center gap-3">
                <Input type="number" step="0.1" className="w-28"
                  value={ovRate} onChange={(e) => setOvRate(Number(e.target.value))} />
                <span className="text-sm text-muted-foreground">%</span>
                <Button variant="outline" size="sm" onClick={() => {
                  s.setOverrides([{ level: 1, rate: ovRate / 100 }]);
                  toast.success("✓");
                }}>{t("btn_save")}</Button>
              </div>
              {s.overrides.length > 0 && (
                <p className="text-xs text-accent">✓ {(s.overrides[0].rate * 100).toFixed(1)}% {es ? "configurado" : "set"}</p>
              )}
            </div>
          </div>
        )}

        {/* ── Paso 4: Financieras ── */}
        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("sect_finance_desc")}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>{t("lbl_name")}</Label>
                <Input value={financeDraft.name}
                  onChange={(e) => setFinanceDraft({ ...financeDraft, name: e.target.value })} placeholder="Goodleap, Sunrun…" />
              </div>
              <div><Label>{t("lbl_fee_pct")}</Label>
                <Input type="number" step="0.1" value={financeDraft.defaultFee * 100}
                  onChange={(e) => setFinanceDraft({ ...financeDraft, defaultFee: Number(e.target.value) / 100 })} />
              </div>
              <div><Label>{t("lbl_dealer_fee_lbl")}</Label>
                <Input type="number" value={financeDraft.dealerFee}
                  onChange={(e) => setFinanceDraft({ ...financeDraft, dealerFee: Number(e.target.value) })} />
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => {
              if (!financeDraft.name.trim()) return toast.error(t("err_name_required"));
              s.addFinanceCo({ ...financeDraft, usesApprovalDiscount: false, active: true, notes: "" });
              setFinanceDraft({ name: "", defaultFee: 0.05, dealerFee: 0, adminFee: 0 });
              toast.success(t("success_finance_added"));
            }}>
              <Plus className="w-3 h-3 mr-2" />{t("btn_add")}
            </Button>
            {s.financeCompanies.length > 0 && (
              <div className="text-xs text-muted-foreground bg-sky-50 rounded-lg px-3 py-2">
                ✓ {s.financeCompanies.map((f) => f.name).join(", ")}
              </div>
            )}
          </div>
        )}

        {/* ── Paso 5: Splits & Overrides ── */}
        {step === 5 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {es
                ? "Los splits permiten dividir una comisión entre varios vendedores en un mismo invoice."
                : "Splits let you divide a commission between multiple reps on a single invoice."}
            </p>
            <div className="bg-sky-50 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-accent">{es ? "¿Cómo funciona?" : "How it works"}</p>
              <ul className="text-xs text-muted-foreground space-y-1.5 list-none">
                <li>① {es ? "Crea una regla de split con porcentajes por participante." : "Create a split rule with percentages per participant."}</li>
                <li>② {es ? "Asigna la regla al invoice desde el ícono de split en la tabla." : "Assign the rule to an invoice via the split icon in the table."}</li>
                <li>③ {es ? "El admin aprueba el split antes de marcar el invoice como pagado." : "Admin approves the split before marking the invoice paid."}</li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground italic">
              {es
                ? "Configura las reglas detalladas en Compensación → Splits del menú principal."
                : "Configure detailed rules in Compensation → Splits from the main menu."}
            </p>
          </div>
        )}

        {/* ── Paso 6: Advances ── */}
        {step === 6 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {es
                ? "Los advances son pagos anticipados que se descuentan de la comisión final del vendedor."
                : "Advances are upfront payments deducted from the rep's final commission payout."}
            </p>
            <div className="bg-sky-50 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-accent">{es ? "Flujo de advances:" : "Advance flow:"}</p>
              <ul className="text-xs text-muted-foreground space-y-1.5 list-none">
                <li>① {es ? "El admin ingresa el monto de advance en el invoice." : "Admin enters the advance amount on the invoice."}</li>
                <li>② {es ? "El advance se descuenta del pago neto del vendedor." : "The advance is deducted from the rep's net payout."}</li>
                <li>③ {es ? "El balance pendiente queda visible en la cartera del vendedor." : "The pending balance is visible in the rep's wallet."}</li>
              </ul>
            </div>
            <div>
              <Label className="text-xs">{t("lbl_tax_reserve_pct")} {es ? "por defecto en invoices" : "default on invoices"}</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input type="number" step="0.1" className="w-28"
                  defaultValue={20}
                  onChange={(e) => {
                    const v = Number(e.target.value) / 100;
                    s.setCompany({ defaultTaxReserve: v } as any);
                  }} />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {es ? "Se aplica automáticamente a cada nuevo invoice." : "Applied automatically to each new invoice."}
              </p>
            </div>
          </div>
        )}

        {/* ── Paso 7: Invoice de prueba ── */}
        {step === 7 && (
          <div className="space-y-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-cta shadow-btn flex items-center justify-center mx-auto">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{t("wiz_ready")}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {es
                  ? "Tu cuenta está configurada. Genera un PDF de prueba para verificar que todo se ve bien."
                  : "Your account is set up. Generate a test PDF to verify everything looks good."}
              </p>
            </div>
            <Button variant="outline" onClick={generateTest} className="w-full">
              <FileDown className="w-4 h-4 mr-2" />{t("wiz_generate_test")}
            </Button>
            <div className="text-left bg-sky-50 rounded-xl p-4 space-y-1.5">
              <p className="text-xs font-semibold text-accent">{es ? "Resumen de configuración:" : "Setup summary:"}</p>
              <p className="text-xs text-muted-foreground">✓ {t("lbl_company_name")}: <span className="font-medium text-foreground">{s.company.name || "—"}</span></p>
              <p className="text-xs text-muted-foreground">✓ {t("tab_team")}: <span className="font-medium text-foreground">{s.agents.length} {es ? "vendedores" : "reps"}</span></p>
              <p className="text-xs text-muted-foreground">✓ {t("sect_finance")}: <span className="font-medium text-foreground">{s.financeCompanies.length} {es ? "registradas" : "registered"}</span></p>
              <p className="text-xs text-muted-foreground">✓ {t("sect_tiers")}: <span className="font-medium text-foreground">{s.personalTiers.length > 0 ? `${(s.personalTiers[0].rate * 100).toFixed(1)}%` : "—"}</span></p>
              <p className="text-xs text-muted-foreground">✓ {t("sect_overrides")}: <span className="font-medium text-foreground">{s.overrides.length > 0 ? `${(s.overrides[0].rate * 100).toFixed(1)}%` : "—"}</span></p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between mt-6 pt-4 border-t border-border/40">
          <Button variant="ghost" size="sm" onClick={onClose}>{t("wiz_cancel")}</Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={back}>
                <ArrowLeft className="w-4 h-4 mr-1" />{t("wiz_back")}
              </Button>
            )}
            {step < TOTAL - 1
              ? <Button size="sm" onClick={next}>{t("wiz_next")}<ArrowRight className="w-4 h-4 ml-1" /></Button>
              : <Button size="sm" onClick={finish} className="bg-gradient-cta"><Sparkles className="w-4 h-4 mr-1" />{t("wiz_finish")}</Button>
            }
          </div>
        </div>
      </Card>
    </div>
  );
}

/* small unused-export shim to silence textarea import in some bundlers */
export const _ = Textarea;

