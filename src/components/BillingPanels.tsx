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
import { Plus, Trash2, FileDown, Mail, DollarSign, Receipt as ReceiptIcon, Pencil } from "lucide-react";
import {
  useStore, customerInvoiceTotals,
  type CustomerInvoice, type CustomerInvoiceStatus, type CustomerInvoiceLineItem,
} from "@/lib/commission-store";
import { fmtMoney } from "@/lib/commission-calc";
import { buildCustomerInvoicePDF, buildCustomerReceiptPDF } from "@/lib/generate-invoices";

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
              <div key={li.id} className="grid grid-cols-[100px_1fr_70px_100px_auto] gap-2 items-center">
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
                <Button variant="ghost" size="icon" onClick={() => removeLine(i)}><Trash2 className="w-4 h-4" /></Button>
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
