import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, FileDown, Mail, DollarSign, Receipt as ReceiptIcon, Pencil, Paperclip, CheckCircle2, XCircle, CalendarRange } from "lucide-react";
import {
  useStore, customerInvoiceTotals, workStatementTotal,
  eligibleWorkStatements, weeklyStatementTotal,
  payrollEntryAmounts, payrollRegisterTotal, PAYROLL_DISCLAIMER, technicianTerm, resolvePaymentTreatment,
  type CustomerInvoice, type CustomerInvoiceStatus, type CustomerInvoiceLineItem,
  type TechnicianWorkStatement, type WorkStatementStatus,
  type WeeklyTechnicianStatement, type ExclusionReason,
  type PayrollRegister,
} from "@/lib/commission-store";
import { fmtMoney } from "@/lib/commission-calc";
import { buildCustomerInvoicePDF, buildCustomerReceiptPDF } from "@/lib/generate-invoices";

function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function pickAttachmentFile(onDone: (a: { name: string; url: string }) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*,.pdf";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => onDone({ name: file.name, url: e.target?.result as string });
    reader.readAsDataURL(file);
  };
  input.click();
}

/* ---------- Shared SectionCard (duplicated lightweight, matches other panels) ---------- */
function Section({ title, desc, children, action }: { title: string; desc?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="p-6 shadow-card">
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {desc && <p className="text-sm text-muted-foreground mt-1">{desc}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}
function Empty({ msg }: { msg: string }) {
  return <div className="text-center py-10 text-sm text-muted-foreground border border-dashed border-border rounded-lg">{msg}</div>;
}

/** Same "type without snapping to 0 on every keystroke" numeric input used
 * throughout the invoice form (CommissionTool.tsx's NumField). */
function NumField({ value, onChange, className, ...props }: {
  value: number; onChange: (n: number) => void; className?: string;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type">) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      className={className}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw !== "" && raw !== "-" && !/^-?\d*\.?\d*$/.test(raw)) return;
        setText(raw);
        if (raw === "" || raw === "-") return;
        const n = Number(raw);
        if (!Number.isNaN(n)) onChange(n);
      }}
      onBlur={() => { if (text === "" || text === "-") { setText("0"); onChange(0); } }}
    />
  );
}

const STATUS_ORDER: CustomerInvoiceStatus[] = [
  "draft", "sent", "viewed", "partially_paid", "paid", "overdue", "cancelled", "refunded",
];
const STATUS_LABEL_ES: Record<CustomerInvoiceStatus, string> = {
  draft: "Borrador", sent: "Enviado", viewed: "Visto", partially_paid: "Pago parcial",
  paid: "Pagado", overdue: "Vencido", cancelled: "Cancelado", refunded: "Reembolsado",
};
const STATUS_LABEL_EN: Record<CustomerInvoiceStatus, string> = {
  draft: "Draft", sent: "Sent", viewed: "Viewed", partially_paid: "Partially paid",
  paid: "Paid", overdue: "Overdue", cancelled: "Cancelled", refunded: "Refunded",
};
function statusVariant(st: CustomerInvoiceStatus): "default" | "outline" | "destructive" | "secondary" {
  if (st === "paid") return "default";
  if (st === "overdue" || st === "cancelled") return "destructive";
  if (st === "partially_paid" || st === "sent" || st === "viewed") return "secondary";
  return "outline";
}

export function CustomerInvoicesPanel() {
  const s = useStore();
  const isEs = s.language === "es";
  const STATUS_LABEL = isEs ? STATUS_LABEL_ES : STATUS_LABEL_EN;
  const [filter, setFilter] = useState<"all" | CustomerInvoiceStatus>("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [payId, setPayId] = useState<string | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ name: string; url: string } | null>(null);
  const closePdfPreview = () => { if (pdfPreview) URL.revokeObjectURL(pdfPreview.url); setPdfPreview(null); };

  // Jump here (from "Create Customer Invoice" on an invoice row) and open it for editing.
  useEffect(() => {
    const dl = s.deepLink;
    if (!dl || !dl.openCustomerInvoice || !dl.customerInvoiceId) return;
    setEditId(dl.customerInvoiceId);
    s.setDeepLink(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.deepLink?.ts]);

  const list = s.customerInvoices
    .filter((ci) => filter === "all" || ci.status === filter)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const counts: Record<string, number> = { all: s.customerInvoices.length };
  for (const st of STATUS_ORDER) counts[st] = s.customerInvoices.filter((ci) => ci.status === st).length;

  const buildersFor = (ci: CustomerInvoice) => {
    const inv = s.invoices.find((i) => i.id === ci.invoiceId);
    if (!inv) { toast.error(isEs ? "No se encontró la venta vinculada." : "Linked sale not found."); return null; }
    return { inv };
  };

  const preview = (ci: CustomerInvoice) => {
    const ctx = buildersFor(ci); if (!ctx) return;
    const doc = buildCustomerInvoicePDF(ci, ctx.inv, s.company);
    setPdfPreview({ name: `${ci.number} — ${ci.customerName}`, url: doc.output("bloburl").toString() });
  };
  const download = (ci: CustomerInvoice) => {
    const ctx = buildersFor(ci); if (!ctx) return;
    buildCustomerInvoicePDF(ci, ctx.inv, s.company).save(`${ci.number}.pdf`);
  };
  const receipt = (ci: CustomerInvoice) => {
    const ctx = buildersFor(ci); if (!ctx) return;
    if (ci.payments.length === 0) return toast.error(isEs ? "Sin pagos registrados todavía." : "No payments recorded yet.");
    buildCustomerReceiptPDF(ci, ctx.inv, s.company).save(`${ci.number}_receipt.pdf`);
  };
  const emailCustomer = (ci: CustomerInvoice) => {
    // No email-sending infra exists in this app yet (no provider integration,
    // no edge function) — this opens the admin's own mail client instead of
    // actually transmitting anything. Flagged in the button title too.
    const subject = encodeURIComponent(`Invoice ${ci.number}`);
    const body = encodeURIComponent(isEs
      ? `Hola ${ci.customerName},\n\nAdjunto el invoice ${ci.number}. Balance pendiente: ${fmtMoney(customerInvoiceTotals(ci).balance, s.company.currency)}.\n\n(Genera y adjunta el PDF manualmente — este correo no lo envía automáticamente.)`
      : `Hi ${ci.customerName},\n\nAttached is invoice ${ci.number}. Balance due: ${fmtMoney(customerInvoiceTotals(ci).balance, s.company.currency)}.\n\n(Generate and attach the PDF manually — this doesn't send it automatically.)`);
    window.open(`mailto:${ci.customerEmail || ""}?subject=${subject}&body=${body}`, "_blank");
    s.setCustomerInvoiceStatus(ci.id, "sent");
  };

  const editing = s.customerInvoices.find((ci) => ci.id === editId) ?? null;
  const paying = s.customerInvoices.find((ci) => ci.id === payId) ?? null;

  return (
    <>
      <Section
        title={isEs ? "Facturas de cliente" : "Customer Invoices"}
        desc={isEs
          ? "Documento para el cliente, separado de la comisión interna — nunca crea otra comisión ni duplica la venta."
          : "The document for the customer, separate from the internal commission — never creates another commission or duplicates the sale."}
      >
        <div className="flex flex-wrap gap-2 mb-4">
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
            {isEs ? "Todos" : "All"} ({counts.all})
          </Button>
          {STATUS_ORDER.map((st) => (
            <Button key={st} size="sm" variant={filter === st ? "default" : "outline"} onClick={() => setFilter(st)}>
              {STATUS_LABEL[st]} ({counts[st] ?? 0})
            </Button>
          ))}
        </div>

        {list.length === 0 ? (
          <Empty msg={isEs ? "Sin facturas de cliente todavía." : "No customer invoices yet."} />
        ) : (
          <div className="space-y-3">
            {list.map((ci) => {
              const inv = s.invoices.find((i) => i.id === ci.invoiceId);
              const { total, balance } = customerInvoiceTotals(ci);
              return (
                <Card key={ci.id} className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-sm">{ci.number}</span>
                        <span className="text-muted-foreground text-xs">·</span>
                        <span className="text-sm">{ci.customerName || "—"}</span>
                        <Badge variant={statusVariant(ci.status)}>{STATUS_LABEL[ci.status]}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {isEs ? "Venta vinculada" : "Linked sale"}: {inv?.number ?? "—"}
                        {ci.dueDate && <> · {isEs ? "Vence" : "Due"} {ci.dueDate}</>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold font-mono">{fmtMoney(total, s.company.currency)}</p>
                      <p className="text-xs text-muted-foreground">
                        {isEs ? "Balance" : "Balance"}: <span className={balance > 0 ? "text-destructive font-medium" : ""}>{fmtMoney(balance, s.company.currency)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border/50">
                    <Button size="sm" variant="outline" onClick={() => setEditId(ci.id)}>
                      <Pencil className="w-3.5 h-3.5 mr-1" />{isEs ? "Editar" : "Edit"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => preview(ci)}>
                      {isEs ? "Vista previa" : "Preview"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => download(ci)}>
                      <FileDown className="w-3.5 h-3.5 mr-1" />PDF
                    </Button>
                    <Button size="sm" variant="ghost"
                      title={isEs ? "Abre tu cliente de correo — no envía el PDF automáticamente (no hay envío de correo integrado todavía)" : "Opens your mail client — doesn't send the PDF automatically (no email sending is wired up yet)"}
                      onClick={() => emailCustomer(ci)}>
                      <Mail className="w-3.5 h-3.5 mr-1" />{isEs ? "Enviar" : "Email"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPayId(ci.id)}>
                      <DollarSign className="w-3.5 h-3.5 mr-1" />{isEs ? "Registrar pago" : "Record payment"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => receipt(ci)}>
                      <ReceiptIcon className="w-3.5 h-3.5 mr-1" />{isEs ? "Recibo" : "Receipt"}
                    </Button>
                    <div className="ml-auto">
                      <Select value={ci.status} onValueChange={(v: CustomerInvoiceStatus) => s.setCustomerInvoiceStatus(ci.id, v)}>
                        <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUS_ORDER.map((st) => <SelectItem key={st} value={st}>{STATUS_LABEL[st]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => {
                      if (!confirm(isEs ? "¿Eliminar esta factura de cliente?" : "Delete this customer invoice?")) return;
                      s.removeCustomerInvoice(ci.id);
                    }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      {editing && <CustomerInvoiceEditDialog ci={editing} onClose={() => setEditId(null)} />}
      {paying && <RecordPaymentDialog ci={paying} onClose={() => setPayId(null)} />}

      <Dialog open={!!pdfPreview} onOpenChange={(o) => !o && closePdfPreview()}>
        <DialogContent className="max-w-3xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{pdfPreview?.name}</DialogTitle>
            <DialogDescription>{isEs ? "Vista previa del PDF." : "PDF preview."}</DialogDescription>
          </DialogHeader>
          {pdfPreview && <iframe src={pdfPreview.url} title={pdfPreview.name} className="w-full flex-1 rounded-md border border-border" />}
          <DialogFooter>
            <Button variant="outline" onClick={closePdfPreview}>{isEs ? "Cerrar" : "Close"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CustomerInvoiceEditDialog({ ci, onClose }: { ci: CustomerInvoice; onClose: () => void }) {
  const s = useStore();
  const isEs = s.language === "es";
  const [draft, setDraft] = useState<CustomerInvoice>(ci);
  useEffect(() => setDraft(ci), [ci.id]);

  const addLine = () => setDraft({
    ...draft,
    lineItems: [...draft.lineItems, { id: crypto.randomUUID(), productId: null, kind: "product", label: "", quantity: 1, unitPrice: 0 }],
  });
  const updateLine = (i: number, patch: Partial<CustomerInvoiceLineItem>) => setDraft({
    ...draft,
    lineItems: draft.lineItems.map((li, j) => (j === i ? { ...li, ...patch } : li)),
  });
  const removeLine = (i: number) => setDraft({ ...draft, lineItems: draft.lineItems.filter((_, j) => j !== i) });

  const { lineTotal, total, balance } = customerInvoiceTotals(draft);

  const save = () => {
    if (!draft.customerName.trim()) return toast.error(isEs ? "Falta el nombre del cliente." : "Customer name is required.");
    s.updateCustomerInvoice(draft.id, draft);
    toast.success(isEs ? "Factura de cliente guardada." : "Customer invoice saved.");
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.number}</DialogTitle>
          <DialogDescription>{isEs ? "Factura de cliente" : "Customer invoice"}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label>{isEs ? "Nombre del cliente" : "Customer name"}</Label>
            <Input value={draft.customerName} onChange={(e) => setDraft({ ...draft, customerName: e.target.value })} />
          </div>
          <div><Label>Email</Label>
            <Input type="email" value={draft.customerEmail} onChange={(e) => setDraft({ ...draft, customerEmail: e.target.value })} />
          </div>
          <div><Label>{isEs ? "Dirección de facturación" : "Billing address"}</Label>
            <Input value={draft.billingAddress} onChange={(e) => setDraft({ ...draft, billingAddress: e.target.value })} />
          </div>
          <div><Label>{isEs ? "Dirección de servicio" : "Service address"}</Label>
            <Input value={draft.serviceAddress} onChange={(e) => setDraft({ ...draft, serviceAddress: e.target.value })} />
          </div>
          <div><Label>{isEs ? "Fecha de invoice" : "Invoice date"}</Label>
            <Input type="date" value={draft.invoiceDate} onChange={(e) => setDraft({ ...draft, invoiceDate: e.target.value })} />
          </div>
          <div><Label>{isEs ? "Fecha de vencimiento" : "Due date"}</Label>
            <Input type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-semibold">{isEs ? "Productos / Servicios" : "Products / Services"}</Label>
            <Button variant="outline" size="sm" onClick={addLine}><Plus className="w-3 h-3 mr-1" />{isEs ? "Agregar línea" : "Add line"}</Button>
          </div>
          <div className="space-y-2">
            {draft.lineItems.length === 0 && <p className="text-xs text-muted-foreground">{isEs ? "Sin líneas." : "No lines."}</p>}
            {draft.lineItems.map((li, i) => (
              <div key={li.id} className="grid grid-cols-2 sm:grid-cols-[100px_1fr_70px_100px_auto] gap-2 items-center pb-2 mb-1 border-b border-border/50 sm:border-0 sm:pb-0 sm:mb-0">
                <Select value={li.kind} onValueChange={(v: "product" | "service") => updateLine(i, { kind: v })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product">{isEs ? "Producto" : "Product"}</SelectItem>
                    <SelectItem value="service">{isEs ? "Servicio" : "Service"}</SelectItem>
                  </SelectContent>
                </Select>
                <Input className="h-8" value={li.label} placeholder={isEs ? "Descripción" : "Description"} onChange={(e) => updateLine(i, { label: e.target.value })} />
                <NumField className="h-8" step="1" value={li.quantity} onChange={(n) => updateLine(i, { quantity: n })} />
                <NumField className="h-8" step="0.01" value={li.unitPrice} onChange={(n) => updateLine(i, { unitPrice: n })} />
                <Button variant="ghost" size="icon" className="col-span-2 justify-self-end sm:col-span-1" onClick={() => removeLine(i)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div><Label className="text-xs">{isEs ? "Descuento" : "Discount"}</Label>
            <NumField step="0.01" value={draft.discount} onChange={(n) => setDraft({ ...draft, discount: n })} />
          </div>
          <div><Label className="text-xs">{isEs ? "Impuesto %" : "Tax %"}</Label>
            <NumField step="0.1" value={Number((draft.taxPercent * 100).toFixed(4))} onChange={(n) => setDraft({ ...draft, taxPercent: n / 100 })} />
          </div>
          <div><Label className="text-xs">{isEs ? "Depósito" : "Deposit"}</Label>
            <NumField step="0.01" value={draft.deposit} onChange={(n) => setDraft({ ...draft, deposit: n })} />
          </div>
          <div><Label className="text-xs">{isEs ? "Financiado" : "Financing applied"}</Label>
            <NumField step="0.01" value={draft.financingApplied} onChange={(n) => setDraft({ ...draft, financingApplied: n })} />
          </div>
        </div>

        <div className="flex justify-between text-sm mt-3 bg-muted/40 rounded-lg px-4 py-3">
          <span className="text-muted-foreground">{isEs ? "Subtotal" : "Subtotal"}: {fmtMoney(lineTotal, s.company.currency)}</span>
          <span className="font-semibold">{isEs ? "Balance" : "Balance"}: {fmtMoney(balance, s.company.currency)}</span>
          <span className="font-bold text-accent">{isEs ? "Total" : "Total"}: {fmtMoney(total, s.company.currency)}</span>
        </div>

        <div className="grid grid-cols-1 gap-3 mt-4">
          <div><Label className="text-xs">{isEs ? "Términos de pago" : "Payment terms"}</Label>
            <Textarea rows={2} value={draft.paymentTerms} onChange={(e) => setDraft({ ...draft, paymentTerms: e.target.value })} />
          </div>
          <div><Label className="text-xs">{isEs ? "Información de garantía" : "Warranty information"}</Label>
            <Textarea rows={2} value={draft.warrantyInfo} onChange={(e) => setDraft({ ...draft, warrantyInfo: e.target.value })} />
          </div>
          <div><Label className="text-xs">{isEs ? "Notas" : "Notes"}</Label>
            <Textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{isEs ? "Cancelar" : "Cancel"}</Button>
          <Button onClick={save}>{isEs ? "Guardar" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordPaymentDialog({ ci, onClose }: { ci: CustomerInvoice; onClose: () => void }) {
  const s = useStore();
  const isEs = s.language === "es";
  const { balance } = customerInvoiceTotals(ci);
  const [form, setForm] = useState({ amount: balance, date: new Date().toISOString().slice(0, 10), method: "cash", reference: "", notes: "" });

  const submit = () => {
    if (!form.amount || form.amount <= 0) return toast.error(isEs ? "Ingresa un monto." : "Enter an amount.");
    s.recordCustomerInvoicePayment(ci.id, {
      amount: form.amount, date: form.date, method: form.method, reference: form.reference, notes: form.notes,
      recordedBy: s.currentUserName,
    });
    toast.success(isEs ? "Pago registrado." : "Payment recorded.");
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEs ? "Registrar pago" : "Record payment"}</DialogTitle>
          <DialogDescription>
            {ci.number} — {isEs ? "Balance actual" : "Current balance"}: {fmtMoney(balance, s.company.currency)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">{isEs ? "Monto" : "Amount"}</Label>
            <NumField step="0.01" value={form.amount} onChange={(n) => setForm({ ...form, amount: n })} />
          </div>
          <div><Label className="text-xs">{isEs ? "Fecha" : "Date"}</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div><Label className="text-xs">{isEs ? "Método" : "Method"}</Label>
            <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">{isEs ? "Efectivo" : "Cash"}</SelectItem>
                <SelectItem value="check">{isEs ? "Cheque" : "Check"}</SelectItem>
                <SelectItem value="card">{isEs ? "Tarjeta" : "Card"}</SelectItem>
                <SelectItem value="financing">{isEs ? "Financiamiento" : "Financing"}</SelectItem>
                <SelectItem value="other">{isEs ? "Otro" : "Other"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">{isEs ? "Referencia" : "Reference"}</Label>
            <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </div>
          <div className="col-span-2"><Label className="text-xs">{isEs ? "Notas" : "Notes"}</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{isEs ? "Cancelar" : "Cancel"}</Button>
          <Button onClick={submit}>{isEs ? "Registrar" : "Record"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ========================================================================
 * TECHNICIAN WORK STATEMENTS — Phase 2 of Billing & Technician Payables.
 * One per technician per job (isGeneralInvoice=true invoice), the
 * approval/audit/attachments layer that sits on top of it. Never touches
 * the underlying invoice's fixedPay/extras — those still drive calcPayouts.
 * ======================================================================== */
const WS_STATUS_ORDER: WorkStatementStatus[] = ["draft", "submitted", "approved", "rejected", "paid"];
const WS_STATUS_LABEL_ES: Record<WorkStatementStatus, string> = {
  draft: "Borrador", submitted: "Enviado", approved: "Aprobado", rejected: "Rechazado", paid: "Pagado",
};
const WS_STATUS_LABEL_EN: Record<WorkStatementStatus, string> = {
  draft: "Draft", submitted: "Submitted", approved: "Approved", rejected: "Rejected", paid: "Paid",
};
function wsStatusVariant(st: WorkStatementStatus): "default" | "outline" | "destructive" | "secondary" {
  if (st === "approved" || st === "paid") return "default";
  if (st === "rejected") return "destructive";
  if (st === "submitted") return "secondary";
  return "outline";
}

export function WorkStatementsPanel() {
  const s = useStore();
  const isEs = s.language === "es";
  const STATUS_LABEL = isEs ? WS_STATUS_LABEL_ES : WS_STATUS_LABEL_EN;
  const isAdmin = s.role !== "rep";
  const myAgentId = !isAdmin ? s.activeAgentId : null;
  const [filter, setFilter] = useState<"all" | WorkStatementStatus>("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const techSingular = technicianTerm(s.company, isEs);
  const visible = isAdmin ? s.workStatements : s.workStatements.filter((w) => w.technicianId === myAgentId);
  const list = visible.filter((w) => filter === "all" || w.status === filter).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const counts: Record<string, number> = { all: visible.length };
  for (const st of WS_STATUS_ORDER) counts[st] = visible.filter((w) => w.status === st).length;

  const editing = s.workStatements.find((w) => w.id === editId) ?? null;
  const rejecting = s.workStatements.find((w) => w.id === rejectId) ?? null;

  useEffect(() => {
    const dl = s.deepLink;
    if (!dl || !dl.openWorkStatement || !dl.workStatementId) return;
    setEditId(dl.workStatementId);
    s.setDeepLink(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.deepLink?.ts]);

  return (
    <>
      <Section
        title={isEs ? `Estados de trabajo del ${techSingular.toLowerCase()}` : `${techSingular} Work Statements`}
        desc={isEs
          ? `Una hoja de aprobación por ${techSingular.toLowerCase()} y trabajo — no cambia el pago fijo del invoice general, solo el flujo de aprobación alrededor.`
          : `One approval sheet per ${techSingular.toLowerCase()} per job — doesn't change the general invoice's fixed pay, just the approval workflow around it.`}
      >
        <div className="flex flex-wrap gap-2 mb-4">
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
            {isEs ? "Todos" : "All"} ({counts.all})
          </Button>
          {WS_STATUS_ORDER.map((st) => (
            <Button key={st} size="sm" variant={filter === st ? "default" : "outline"} onClick={() => setFilter(st)}>
              {STATUS_LABEL[st]} ({counts[st] ?? 0})
            </Button>
          ))}
        </div>

        {list.length === 0 ? (
          <Empty msg={isEs ? "Sin estados de trabajo todavía." : "No work statements yet."} />
        ) : (
          <div className="space-y-3">
            {list.map((w) => {
              const inv = s.invoices.find((i) => i.id === w.invoiceId);
              const tech = s.agents.find((a) => a.id === w.technicianId);
              const total = workStatementTotal(w, inv);
              return (
                <Card key={w.id} className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-sm">{w.number}</span>
                        <span className="text-muted-foreground text-xs">·</span>
                        <span className="text-sm">{tech?.name ?? "—"}</span>
                        <Badge variant={wsStatusVariant(w.status)}>{STATUS_LABEL[w.status]}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {isEs ? "Trabajo" : "Job"}: {inv?.number ?? "—"} · {inv?.customerName || "—"}
                        {inv?.jobType && <> · {inv.jobType === "installation" ? (isEs ? "Instalación" : "Installation") : (isEs ? "Servicio" : "Service")}</>}
                        {w.rateLabelSnapshot && <> · {w.rateLabelSnapshot}</>}
                      </p>
                    </div>
                    <p className="text-lg font-bold font-mono shrink-0">{fmtMoney(total, s.company.currency)}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border/50">
                    <Button size="sm" variant="outline" onClick={() => setEditId(w.id)}>
                      <Pencil className="w-3.5 h-3.5 mr-1" />{isEs ? "Editar" : "Edit"}
                    </Button>
                    {w.status === "draft" && (
                      <Button size="sm" variant="outline" onClick={() => { s.submitWorkStatement(w.id, s.currentUserName); toast.success(isEs ? "Enviado para aprobación." : "Submitted for approval."); }}>
                        {isEs ? "Enviar" : "Submit"}
                      </Button>
                    )}
                    {isAdmin && w.status === "submitted" && (
                      <>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => { s.approveWorkStatement(w.id, s.currentUserName); toast.success(isEs ? "Aprobado." : "Approved."); }}>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />{isEs ? "Aprobar" : "Approve"}
                        </Button>
                        <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50"
                          onClick={() => setRejectId(w.id)}>
                          <XCircle className="w-3.5 h-3.5 mr-1" />{isEs ? "Rechazar" : "Reject"}
                        </Button>
                      </>
                    )}
                    {w.attachments.length > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Paperclip className="w-3.5 h-3.5" />{w.attachments.length}
                      </span>
                    )}
                    {isAdmin && (
                      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => {
                        if (!confirm(isEs ? "¿Eliminar este estado de trabajo?" : "Delete this work statement?")) return;
                        s.removeWorkStatement(w.id);
                      }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      {editing && <WorkStatementEditDialog ws={editing} onClose={() => setEditId(null)} readOnly={!isAdmin} />}

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejectId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{isEs ? "Motivo del rechazo" : "Rejection reason"}</DialogTitle>
          </DialogHeader>
          <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectId(null); setRejectReason(""); }}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button variant="destructive" onClick={() => {
              if (!rejecting) return;
              s.rejectWorkStatement(rejecting.id, s.currentUserName, rejectReason.trim() || (isEs ? "Sin motivo" : "No reason given"));
              setRejectId(null); setRejectReason("");
              toast(isEs ? "Rechazado." : "Rejected.");
            }}>{isEs ? "Rechazar" : "Reject"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function WorkStatementEditDialog({ ws, onClose, readOnly }: { ws: TechnicianWorkStatement; onClose: () => void; readOnly?: boolean }) {
  const s = useStore();
  const isEs = s.language === "es";
  const [draft, setDraft] = useState<TechnicianWorkStatement>(ws);
  useEffect(() => setDraft(ws), [ws.id]);
  const inv = s.invoices.find((i) => i.id === ws.invoiceId);
  const total = workStatementTotal(draft, inv);

  const save = () => {
    s.updateWorkStatement(draft.id, draft);
    toast.success(isEs ? "Guardado." : "Saved.");
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.number}</DialogTitle>
          <DialogDescription>
            {inv?.customerName || "—"} · {inv?.number ?? "—"} · {draft.rateLabelSnapshot}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">{isEs ? "Tarifa base (congelada)" : "Base rate (frozen)"}</Label>
            <Input disabled value={fmtMoney(draft.baseRateSnapshot, s.company.currency)} />
          </div>
          <div><Label className="text-xs">{isEs ? "Tarifa de millaje" : "Mileage rate"}</Label>
            <Input disabled value={fmtMoney(draft.mileageRateSnapshot, s.company.currency)} />
          </div>
          <div><Label className="text-xs">{isEs ? "Millas" : "Mileage"}</Label>
            <NumField step="1" value={draft.mileage} onChange={(n) => setDraft({ ...draft, mileage: n })} disabled={readOnly} />
          </div>
          <div><Label className="text-xs">{isEs ? "Reembolso de materiales" : "Material reimbursement"}</Label>
            <NumField step="0.01" value={draft.materialReimbursement} onChange={(n) => setDraft({ ...draft, materialReimbursement: n })} disabled={readOnly} />
          </div>
          <div><Label className="text-xs">{isEs ? "Deducciones" : "Deductions"}</Label>
            <NumField step="0.01" value={draft.deductions} onChange={(n) => setDraft({ ...draft, deductions: n })} disabled={readOnly} />
          </div>
          <div><Label className="text-xs">{isEs ? "Contracargos" : "Chargebacks"}</Label>
            <NumField step="0.01" value={draft.chargebacks} onChange={(n) => setDraft({ ...draft, chargebacks: n })} disabled={readOnly} />
          </div>
          <div className="col-span-2"><Label className="text-xs">{isEs ? "Correcciones" : "Corrections"}</Label>
            <NumField step="0.01" value={draft.corrections} onChange={(n) => setDraft({ ...draft, corrections: n })} disabled={readOnly} />
          </div>
        </div>

        <div className="flex justify-end text-sm mt-2">
          <span className="font-bold text-accent">{isEs ? "Total a pagar" : "Total due"}: {fmtMoney(total, s.company.currency)}</span>
        </div>

        <div className="mt-3">
          <Label className="text-xs">{isEs ? "Notas" : "Notes"}</Label>
          <Textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} disabled={readOnly} />
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs font-semibold">{isEs ? "Adjuntos / fotos" : "Attachments / photos"}</Label>
            {!readOnly && (
              <Button variant="outline" size="sm" onClick={() => pickAttachmentFile((a) => s.addWorkStatementAttachment(draft.id, a))}>
                <Paperclip className="w-3.5 h-3.5 mr-1" />{isEs ? "Adjuntar" : "Attach"}
              </Button>
            )}
          </div>
          {draft.attachments.length === 0 ? (
            <p className="text-xs text-muted-foreground">{isEs ? "Sin adjuntos." : "No attachments."}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {draft.attachments.map((a, i) => (
                a.url.startsWith("data:image") ? (
                  <img key={i} src={a.url} alt={a.name} className="h-16 w-16 object-cover rounded border border-border" />
                ) : (
                  <a key={i} href={a.url} download={a.name} className="text-xs px-2 py-1 rounded border border-border bg-muted/40">{a.name}</a>
                )
              ))}
            </div>
          )}
        </div>

        <div className="mt-3">
          <Label className="text-xs font-semibold">{isEs ? "Historial de aprobación" : "Approval history"}</Label>
          <div className="space-y-1 mt-1">
            {draft.approvalHistory.map((ev, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                {new Date(ev.at).toLocaleString()} — <span className="font-medium">{ev.actor}</span> {ev.action}{ev.message ? `: ${ev.message}` : ""}
              </p>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{isEs ? "Cerrar" : "Close"}</Button>
          {!readOnly && <Button onClick={save}>{isEs ? "Guardar" : "Save"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ========================================================================
 * WEEKLY TECHNICIAN STATEMENTS + COMPANY PAYABLES SUMMARY
 * Phase 3 of Billing & Technician Payables. Batches one technician's
 * approved Work Statements for a period into a single payable — a Work
 * Statement can only ever be in one active batch (double-payment
 * prevention). Marking a batch paid reuses the existing payments ledger,
 * so it shows up in the Payout Calendar / 1099 totals like everything else.
 * ======================================================================== */
const EXCLUSION_LABEL_ES: Record<ExclusionReason, string> = {
  already_batched: "Ya está en otro lote", not_approved: "No aprobado",
  cancelled: "Rechazado/cancelado", superseded: "Reemplazado", already_paid: "Ya pagado",
};
const EXCLUSION_LABEL_EN: Record<ExclusionReason, string> = {
  already_batched: "Already in another batch", not_approved: "Not approved",
  cancelled: "Rejected/cancelled", superseded: "Superseded", already_paid: "Already paid",
};

export function WeeklyStatementsPanel() {
  const s = useStore();
  const isEs = s.language === "es";
  const EXCLUSION_LABEL = isEs ? EXCLUSION_LABEL_ES : EXCLUSION_LABEL_EN;
  const techSingular = technicianTerm(s.company, isEs);
  const techPlural = technicianTerm(s.company, isEs, true);

  const technicians = s.agents.filter((a) => {
    const pos = s.positions.find((p) => p.name === a.level);
    // Only agents actually routed through this contractor-payables pipeline —
    // an agent whose paymentTreatment is "payroll" gets paid through the
    // Payroll Register instead, even if their position is isGeneralInvoice.
    return pos?.isGeneralInvoice && resolvePaymentTreatment(a) === "contractor_payables";
  });

  const [genTech, setGenTech] = useState("");
  const [periodStart, setPeriodStart] = useState(new Date().toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [payId, setPayId] = useState<string | null>(null);
  const [payRef, setPayRef] = useState("");
  const [summaryFrom, setSummaryFrom] = useState("");
  const [summaryTo, setSummaryTo] = useState("");

  const preview = genTech ? eligibleWorkStatements(genTech, s.workStatements) : null;

  const generate = () => {
    if (!genTech) return toast.error(isEs ? `Elige un ${techSingular.toLowerCase()}.` : `Pick a ${techSingular.toLowerCase()}.`);
    const id = s.generateWeeklyStatement(genTech, periodStart, periodEnd);
    if (!id) return toast.error(isEs ? `Nada elegible para este ${techSingular.toLowerCase()}.` : `Nothing eligible for this ${techSingular.toLowerCase()}.`);
    toast.success(isEs ? "Lote generado." : "Batch generated.");
  };

  const list = s.weeklyStatements.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const paying = s.weeklyStatements.find((w) => w.id === payId) ?? null;

  const summaryList = list.filter((w) =>
    (!summaryFrom || w.periodStart >= summaryFrom) && (!summaryTo || w.periodEnd <= summaryTo)
  );
  const summaryTotal = summaryList.reduce((sum, w) => sum + weeklyStatementTotal(w, s.workStatements, s.invoices), 0);

  const exportSummary = () => {
    const rows: (string | number)[][] = [[techSingular, "Statement", "Period start", "Period end", "Status", "Total"]];
    for (const w of summaryList) {
      const tech = s.agents.find((a) => a.id === w.technicianId);
      rows.push([tech?.name ?? "—", w.number, w.periodStart, w.periodEnd, w.status, weeklyStatementTotal(w, s.workStatements, s.invoices).toFixed(2)]);
    }
    downloadCSV("company_payables_summary.csv", rows);
  };

  return (
    <>
      <Section
        title={isEs ? "Resumen de pagos de la compañía" : "Company Payables Summary"}
        desc={isEs ? `Total a pagar a ${techPlural.toLowerCase()} en un período, a través de todos los lotes semanales.` : `Total payable to ${techPlural.toLowerCase()} in a period, across all weekly batches.`}
        action={
          <div className="flex flex-wrap items-end gap-2">
            <div><Label className="text-xs">{isEs ? "Desde" : "From"}</Label><Input type="date" className="h-8" value={summaryFrom} onChange={(e) => setSummaryFrom(e.target.value)} /></div>
            <div><Label className="text-xs">{isEs ? "Hasta" : "To"}</Label><Input type="date" className="h-8" value={summaryTo} onChange={(e) => setSummaryTo(e.target.value)} /></div>
            <Button size="sm" variant="outline" onClick={exportSummary} disabled={!summaryList.length}>
              <FileDown className="w-3.5 h-3.5 mr-1" />CSV
            </Button>
          </div>
        }
      >
        <div className="flex items-center justify-between text-sm bg-muted/40 rounded-lg px-4 py-3">
          <span className="text-muted-foreground">{summaryList.length} {isEs ? "lote(s)" : "batch(es)"}</span>
          <span className="font-mono font-bold text-lg text-accent">{fmtMoney(summaryTotal, s.company.currency)}</span>
        </div>
      </Section>

      <Section
        title={isEs ? "Generar lote semanal" : "Generate weekly batch"}
        desc={isEs ? `Consolida los estados de trabajo aprobados de un ${techSingular.toLowerCase()} en un solo pago.` : `Consolidates a ${techSingular.toLowerCase()}'s approved work statements into one payable.`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div className="sm:col-span-2"><Label className="text-xs">{techSingular}</Label>
            <Select value={genTech || "none"} onValueChange={(v) => setGenTech(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder={isEs ? "Elegir…" : "Pick…"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {technicians.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">{isEs ? "Desde" : "From"}</Label>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div><Label className="text-xs">{isEs ? "Hasta" : "To"}</Label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>

        {preview && (
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">
                {isEs ? "Elegibles" : "Eligible"} ({preview.eligible.length})
              </p>
              {preview.eligible.length === 0 ? (
                <p className="text-xs text-muted-foreground">{isEs ? "Ninguno." : "None."}</p>
              ) : (
                <div className="space-y-1">
                  {preview.eligible.map((w) => (
                    <div key={w.id} className="flex justify-between text-sm bg-emerald-500/5 border border-emerald-500/20 rounded px-2 py-1">
                      <span>{w.number}</span>
                      <span className="font-mono">{fmtMoney(workStatementTotal(w, s.invoices.find((i) => i.id === w.invoiceId)), s.company.currency)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {preview.excluded.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">
                  {isEs ? "Excluidos" : "Excluded"} ({preview.excluded.length})
                </p>
                <div className="space-y-1">
                  {preview.excluded.map(({ ws, reason }) => (
                    <div key={ws.id} className="flex justify-between text-xs bg-muted/40 rounded px-2 py-1 text-muted-foreground">
                      <span>{ws.number}</span>
                      <span>{EXCLUSION_LABEL[reason]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Button onClick={generate} disabled={!preview.eligible.length}>
              <Plus className="w-4 h-4 mr-2" />{isEs ? "Generar lote" : "Generate batch"}
            </Button>
          </div>
        )}
      </Section>

      <Section title={isEs ? "Lotes semanales" : "Weekly batches"}>
        {list.length === 0 ? (
          <Empty msg={isEs ? "Sin lotes todavía." : "No batches yet."} />
        ) : (
          <div className="space-y-3">
            {list.map((w) => {
              const tech = s.agents.find((a) => a.id === w.technicianId);
              const total = weeklyStatementTotal(w, s.workStatements, s.invoices);
              return (
                <Card key={w.id} className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-sm">{w.number}</span>
                        <span className="text-muted-foreground text-xs">·</span>
                        <span className="text-sm">{tech?.name ?? "—"}</span>
                        <Badge variant={w.status === "paid" ? "default" : w.status === "approved" ? "secondary" : "outline"}>{w.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarRange className="w-3 h-3" />{w.periodStart} – {w.periodEnd} · {w.workStatementIds.length} {isEs ? "estados" : "statements"}
                      </p>
                    </div>
                    <p className="text-lg font-bold font-mono">{fmtMoney(total, s.company.currency)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border/50">
                    {w.status === "locked" && (
                      <Button size="sm" onClick={() => { s.approveWeeklyStatement(w.id, s.currentUserName); toast.success(isEs ? "Aprobado." : "Approved."); }}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />{isEs ? "Aprobar" : "Approve"}
                      </Button>
                    )}
                    {w.status === "approved" && (
                      <Button size="sm" onClick={() => { setPayId(w.id); setPayRef(""); }}>
                        <DollarSign className="w-3.5 h-3.5 mr-1" />{isEs ? "Marcar pagado" : "Mark paid"}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={() => {
                      if (!confirm(isEs ? "¿Eliminar este lote? Los estados de trabajo quedarán elegibles de nuevo." : "Delete this batch? Its work statements become eligible again.")) return;
                      s.removeWeeklyStatement(w.id);
                    }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      <Dialog open={!!paying} onOpenChange={(o) => !o && setPayId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{isEs ? "Marcar como pagado" : "Mark as paid"}</DialogTitle>
            <DialogDescription>{paying?.number}</DialogDescription>
          </DialogHeader>
          <div><Label className="text-xs">{isEs ? "Referencia de pago" : "Payment reference"}</Label>
            <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder={isEs ? "ej. ACH #1234" : "e.g. ACH #1234"} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayId(null)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={() => {
              if (!paying) return;
              s.markWeeklyStatementPaid(paying.id, payRef.trim());
              setPayId(null);
              toast.success(isEs ? "Marcado como pagado." : "Marked as paid.");
            }}>{isEs ? "Confirmar" : "Confirm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ========================================================================
 * PAYROLL REGISTER — Phase 4 of Billing & Technician Payables.
 * W-2 EMPLOYEES ONLY — entirely separate from the contractor/vendor
 * payables above. NOT a payroll tax filer; see PAYROLL_DISCLAIMER.
 * ======================================================================== */
export function PayrollPanel() {
  const s = useStore();
  const isEs = s.language === "es";
  const [periodStart, setPeriodStart] = useState(new Date().toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [openId, setOpenId] = useState<string | null>(null);

  const w2Agents = s.agents.filter((a) => resolvePaymentTreatment(a) === "payroll");
  const list = s.payrollRegisters.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const open = s.payrollRegisters.find((r) => r.id === openId) ?? null;

  const generate = () => {
    if (!w2Agents.length) return toast.error(isEs ? "No hay empleados con tratamiento de pago 'Nómina' en Equipo." : "No agents have 'Payroll' as their payment treatment in Equipo.");
    const id = s.createPayrollRegister(periodStart, periodEnd);
    setOpenId(id);
    toast.success(isEs ? "Nómina creada." : "Payroll register created.");
  };

  return (
    <>
      <Section
        title={isEs ? "Nómina (Payroll Register)" : "Payroll Register"}
        desc={isEs
          ? "Solo empleados W-2 — separado por completo de los pagos a contratistas de arriba."
          : "W-2 employees only — completely separate from the contractor payables above."}
      >
        <p className="text-xs text-muted-foreground italic bg-muted/40 rounded-lg px-3 py-2 mb-4">
          {isEs
            ? "Transpare prepara la información de nómina para revisión y exportación. La retención final, la declaración y el procesamiento de nómina deben completarse a través de un proveedor de nómina autorizado o un profesional calificado."
            : PAYROLL_DISCLAIMER}
        </p>

        <div className="mb-4">
          <Label className="text-xs font-semibold">{isEs ? "Clasificación por empleado" : "Per-agent classification"}</Label>
          <p className="text-xs text-muted-foreground mt-0.5 mb-2">
            {isEs
              ? "Tres cosas separadas a propósito: relación laboral (legal) y tratamiento de pago (qué sistema los paga) no tienen que coincidir — ej. un empleado W-2 pagado por trabajo a través de Estados de trabajo."
              : "Deliberately separate: worker relationship (legal) and payment treatment (which system pays them) don't have to match — e.g. a W-2 employee still paid per-job through Work Statements."}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground uppercase">
                <tr>
                  <th className="py-1 pr-2">{isEs ? "Empleado" : "Agent"}</th>
                  <th className="pr-2">{isEs ? "Relación laboral" : "Worker relationship"}</th>
                  <th className="pr-2">{isEs ? "Tratamiento de pago" : "Payment treatment"}</th>
                  <th>{isEs ? "TIN/SSN (últimos 4)" : "TIN/SSN (last 4)"}</th>
                </tr>
              </thead>
              <tbody>
                {s.agents.map((a) => (
                  <tr key={a.id} className="border-t border-border/60">
                    <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{a.name}</td>
                    <td className="pr-2">
                      <Select value={a.payrollType ?? "contractor"} onValueChange={(v: "w2" | "contractor") => s.updateAgent(a.id, { payrollType: v })}>
                        <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contractor">{isEs ? "Contratista (1099)" : "Contractor (1099)"}</SelectItem>
                          <SelectItem value="w2">{isEs ? "Empleado (W-2)" : "Employee (W-2)"}</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="pr-2">
                      <Select value={resolvePaymentTreatment(a)} onValueChange={(v: "payroll" | "contractor_payables") => s.updateAgent(a.id, { paymentTreatment: v })}>
                        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contractor_payables">{isEs ? "Estados de trabajo" : "Work Statements"}</SelectItem>
                          <SelectItem value="payroll">{isEs ? "Nómina" : "Payroll"}</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td>
                      <Input
                        className="h-8 w-20 font-mono"
                        maxLength={4}
                        placeholder="••••"
                        value={s.agentTaxIds.find((t) => t.id === a.id)?.last4 ?? ""}
                        onChange={(e) => s.setAgentTaxIdLast4(a.id, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div><Label className="text-xs">{isEs ? "Desde" : "From"}</Label>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div><Label className="text-xs">{isEs ? "Hasta" : "To"}</Label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
          <Button onClick={generate}><Plus className="w-4 h-4 mr-2" />{isEs ? "Generar nómina" : "Generate register"}</Button>
        </div>
      </Section>

      <Section title={isEs ? "Registros de nómina" : "Payroll registers"}>
        {list.length === 0 ? (
          <Empty msg={isEs ? "Sin registros todavía." : "No registers yet."} />
        ) : (
          <div className="space-y-3">
            {list.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{r.number}</span>
                      <Badge variant={r.status === "paid" ? "default" : r.status === "approved" ? "secondary" : "outline"}>{r.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CalendarRange className="w-3 h-3" />{r.periodStart} – {r.periodEnd} · {r.entries.length} {isEs ? "empleados" : "employees"}
                    </p>
                  </div>
                  <p className="text-lg font-bold font-mono">{fmtMoney(payrollRegisterTotal(r), s.company.currency)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border/50">
                  <Button size="sm" variant="outline" onClick={() => setOpenId(r.id)}>
                    <Pencil className="w-3.5 h-3.5 mr-1" />{isEs ? "Abrir" : "Open"}
                  </Button>
                  {r.status === "draft" && (
                    <Button size="sm" onClick={() => { s.approvePayrollRegister(r.id, s.currentUserName); toast.success(isEs ? "Aprobado." : "Approved."); }}>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />{isEs ? "Aprobar" : "Approve"}
                    </Button>
                  )}
                  {r.status === "approved" && (
                    <Button size="sm" onClick={() => { s.markPayrollRegisterPaid(r.id); toast.success(isEs ? "Marcado como pagado." : "Marked as paid."); }}>
                      <DollarSign className="w-3.5 h-3.5 mr-1" />{isEs ? "Marcar pagado" : "Mark paid"}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => {
                    if (!confirm(isEs ? "¿Eliminar esta nómina?" : "Delete this register?")) return;
                    s.removePayrollRegister(r.id);
                  }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>

      {open && <PayrollRegisterDialog reg={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

function PayrollRegisterDialog({ reg, onClose }: { reg: PayrollRegister; onClose: () => void }) {
  const s = useStore();
  const isEs = s.language === "es";

  const exportCSV = () => {
    const rows: (string | number)[][] = [["Employee", "Regular hrs", "OT hrs", "Hourly rate", "OT multiplier", "Gross", "Reimbursements", "Deductions", "Est. withholding", "Net pay"]];
    for (const e of reg.entries) {
      const ag = s.agents.find((a) => a.id === e.agentId);
      const amt = payrollEntryAmounts(e);
      rows.push([ag?.name ?? "—", e.regularHours, e.overtimeHours, e.hourlyRateSnapshot, e.overtimeMultiplierSnapshot,
        amt.grossWage.toFixed(2), e.reimbursements.toFixed(2), e.deductions.toFixed(2), amt.estimatedWithholding.toFixed(2), amt.netPay.toFixed(2)]);
    }
    downloadCSV(`${reg.number}_payroll.csv`, rows);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{reg.number}</DialogTitle>
          <DialogDescription>{reg.periodStart} – {reg.periodEnd}</DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground italic bg-muted/40 rounded-lg px-3 py-2">
          {isEs ? "La retención mostrada es solo un estimado interno — no es un cálculo oficial." : "Withholding shown is an internal estimate only — not an official calculation."}
        </p>

        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground uppercase">
              <tr>
                <th className="py-1">{isEs ? "Empleado" : "Employee"}</th>
                <th>{isEs ? "Hrs reg." : "Reg hrs"}</th>
                <th>{isEs ? "Hrs extra" : "OT hrs"}</th>
                <th className="text-right">{isEs ? "Reembolsos" : "Reimb."}</th>
                <th className="text-right">{isEs ? "Deducciones" : "Deduct."}</th>
                <th className="text-right">{isEs ? "% retención" : "Tax %"}</th>
                <th className="text-right">{isEs ? "Bruto" : "Gross"}</th>
                <th className="text-right">{isEs ? "Neto" : "Net"}</th>
              </tr>
            </thead>
            <tbody>
              {reg.entries.map((e) => {
                const ag = s.agents.find((a) => a.id === e.agentId);
                const amt = payrollEntryAmounts(e);
                const disabled = reg.status !== "draft";
                return (
                  <tr key={e.agentId} className="border-t border-border/60">
                    <td className="py-1 font-medium">{ag?.name ?? "—"}</td>
                    <td><NumField className="h-7 w-16" step="0.25" value={e.regularHours} disabled={disabled}
                      onChange={(n) => s.updatePayrollEntry(reg.id, e.agentId, { regularHours: n })} /></td>
                    <td><NumField className="h-7 w-16" step="0.25" value={e.overtimeHours} disabled={disabled}
                      onChange={(n) => s.updatePayrollEntry(reg.id, e.agentId, { overtimeHours: n })} /></td>
                    <td className="text-right"><NumField className="h-7 w-20" step="0.01" value={e.reimbursements} disabled={disabled}
                      onChange={(n) => s.updatePayrollEntry(reg.id, e.agentId, { reimbursements: n })} /></td>
                    <td className="text-right"><NumField className="h-7 w-20" step="0.01" value={e.deductions} disabled={disabled}
                      onChange={(n) => s.updatePayrollEntry(reg.id, e.agentId, { deductions: n })} /></td>
                    <td className="text-right"><NumField className="h-7 w-16" step="0.1" value={Number((e.taxWithholdingPercent * 100).toFixed(2))} disabled={disabled}
                      onChange={(n) => s.updatePayrollEntry(reg.id, e.agentId, { taxWithholdingPercent: n / 100 })} /></td>
                    <td className="text-right font-mono">{fmtMoney(amt.grossWage, s.company.currency)}</td>
                    <td className="text-right font-mono font-semibold">{fmtMoney(amt.netPay, s.company.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center mt-3">
          <Button variant="outline" size="sm" onClick={exportCSV}><FileDown className="w-3.5 h-3.5 mr-1" />CSV</Button>
          <span className="font-bold text-accent">{isEs ? "Total del registro" : "Register total"}: {fmtMoney(payrollRegisterTotal(reg), s.company.currency)}</span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{isEs ? "Cerrar" : "Close"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
