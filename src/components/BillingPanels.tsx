import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Trash2, FileDown, DollarSign, Pencil, Paperclip,
  CheckCircle2, XCircle, CalendarRange, MapPin, Shield,
} from "lucide-react";
import {
  useStore, customerInvoiceTotals, displayCustomerInvoiceStatus,
  calcWorkStatement, statementTypeOf, isActiveStatement, resolveRate,
  buildPayablesSummary, payrollLineNet, compute1099Rows,
  technicianTerm, resolvePaymentTreatment, TECH_CLASSIFICATIONS, TECH_CLASSIFICATION_LABEL,
  STATEMENT_TYPES, JOB_TYPES,
  type CustomerInvoice, type CustomerInvoiceStatus, type CustomerInvoiceLineItem,
  type JobStatus, type GeoPoint,
  type TechRatePlan, type RatePlanRule, type RateRuleKind,
  type TechWorkStatement, type WorkStatementStatus, type StatementType,
  type Agent, type TechnicianClassification,
} from "@/lib/commission-store";
import { fmtMoney } from "@/lib/commission-calc";

/* ---------- shared helpers ---------- */
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

function pickAttachmentFile(onDone: (a: { id: string; name: string; url: string }) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*,.pdf";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => onDone({ id: crypto.randomUUID(), name: file.name, url: e.target?.result as string });
    reader.readAsDataURL(file);
  };
  input.click();
}

/* ========================================================================
 * 1. TECHNICIANS — Agent-based (classification marks an agent as a
 * technician). Includes the company-wide "allow more than one original
 * work statement" toggle.
 * ======================================================================== */
export function TechniciansPanel() {
  const s = useStore();
  const isEs = s.language === "es";
  const techLabel = technicianTerm(s.company, isEs);
  const techLabelPlural = technicianTerm(s.company, isEs, true);
  const technicians = s.agents.filter((a) => !!a.classification);

  const [form, setForm] = useState({
    name: "", email: "", phone: "", classification: "installer" as TechnicianClassification,
    territory: "", paymentMethod: "ACH", taxReservePercent: 0, is1099: true, companyName: "",
  });

  const addTechnician = () => {
    if (!form.name.trim()) return toast.error(isEs ? "El nombre es obligatorio." : "Name is required.");
    s.addAgent({
      name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(),
      classification: form.classification, state: form.territory.trim(),
      paymentMethod: form.paymentMethod, taxReservePercent: form.taxReservePercent,
      payrollType: form.is1099 ? "contractor" : "w2",
      companyName: form.companyName.trim() || undefined,
      sponsorId: null, active: true,
    });
    setForm({ name: "", email: "", phone: "", classification: "installer", territory: "", paymentMethod: "ACH", taxReservePercent: 0, is1099: true, companyName: "" });
    toast.success(isEs ? `${techLabel} agregado.` : `${techLabel} added.`);
  };

  return (
    <>
      <Section
        title={isEs ? `Permitir más de un estado de trabajo original por ${techLabel.toLowerCase()} y trabajo` : "Allow more than one original work statement per technician and job"}
        desc={isEs
          ? "Desactivado por defecto — un segundo documento debe ser suplementario, corrección o una visita adicional."
          : "Off by default — extra documents must be supplemental, corrective or an additional visit."}
        action={
          <Switch
            checked={s.company.allowMultipleOriginalStatements}
            onCheckedChange={(v) => s.setCompany({ allowMultipleOriginalStatements: v })}
          />
        }
      >
        <p className="text-xs text-muted-foreground">
          {isEs
            ? "Con esto activado, un administrador puede crear un segundo \"Trabajo original\" para el mismo job y técnico — normalmente eso queda bloqueado para evitar pagos duplicados."
            : "With this on, an admin can create a second \"Original Work\" statement for the same job and technician — normally that's blocked to prevent duplicate payouts."}
        </p>
      </Section>

      <Section title={isEs ? `Agregar ${techLabel.toLowerCase()}` : "Add technician"}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div><Label className="text-xs">{isEs ? "Nombre" : "Name"}</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div><Label className="text-xs">Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div><Label className="text-xs">{isEs ? "Teléfono" : "Phone"}</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div><Label className="text-xs">{isEs ? "Clasificación" : "Classification"}</Label>
            <Select value={form.classification} onValueChange={(v: TechnicianClassification) => setForm({ ...form, classification: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TECH_CLASSIFICATIONS.map((c) => <SelectItem key={c} value={c}>{TECH_CLASSIFICATION_LABEL[c][isEs ? "es" : "en"]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">{isEs ? "Territorio" : "Territory"}</Label>
            <Input value={form.territory} onChange={(e) => setForm({ ...form, territory: e.target.value })} />
          </div>
          <div><Label className="text-xs">{isEs ? "Método de pago" : "Payment method"}</Label>
            <Input value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} />
          </div>
          <div><Label className="text-xs">{isEs ? "Reserva de impuestos %" : "Tax reserve %"}</Label>
            <NumField step="0.1" value={form.taxReservePercent * 100} onChange={(n) => setForm({ ...form, taxReservePercent: n / 100 })} />
          </div>
          <div className="flex items-center gap-2 pt-5">
            <Switch checked={form.is1099} onCheckedChange={(v) => setForm({ ...form, is1099: v })} />
            <Label className="text-xs">{isEs ? "Contratista 1099" : "1099 contractor"}</Label>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Label className="text-xs">{isEs ? "Nombre de negocio / LLC (opcional)" : "Business / LLC name (optional)"}</Label>
            <Input value={form.companyName} placeholder="e.g. Navarro Plumbing LLC" onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          </div>
          <div className="flex items-end">
            <Button onClick={addTechnician} className="w-full"><Plus className="w-4 h-4 mr-2" />{isEs ? "Agregar" : "Add"}</Button>
          </div>
        </div>
      </Section>

      <Section title={`${techLabelPlural} (${technicians.length})`}>
        {technicians.length === 0 ? (
          <Empty msg={isEs ? "Sin técnicos todavía." : "No technicians yet."} />
        ) : (
          <div className="space-y-2">
            {technicians.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 border border-border rounded-md p-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{t.name}{t.companyName ? ` — ${t.companyName}` : ""}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {t.classification && TECH_CLASSIFICATION_LABEL[t.classification][isEs ? "es" : "en"]}
                    {t.state ? ` · ${t.state}` : ""}
                    {t.email ? ` · ${t.email}` : ""}
                    {t.phone ? ` · ${t.phone}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={resolvePaymentTreatment(t) === "payroll" ? "secondary" : "outline"}>
                    {resolvePaymentTreatment(t) === "payroll" ? "W-2" : "1099"}
                  </Badge>
                  <label className="flex items-center gap-1.5 text-xs">
                    <Switch checked={t.active !== false} onCheckedChange={(v) => s.updateAgent(t.id, { active: v })} />
                    {isEs ? "Activo" : "Active"}
                  </label>
                  <div className="w-24">
                    <Input
                      className="h-8 font-mono"
                      maxLength={4}
                      placeholder="TIN ••••"
                      value={s.agentTaxIds.find((x) => x.id === t.id)?.last4 ?? ""}
                      onChange={(e) => s.setAgentTaxIdLast4(t.id, e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

/* ========================================================================
 * 2. RATE PLANS
 * ======================================================================== */
export function RatePlansPanel() {
  const s = useStore();
  const isEs = s.language === "es";
  const technicians = s.agents.filter((a) => !!a.classification);
  const [editId, setEditId] = useState<string | null>(null);

  const blankPlan = (): Omit<TechRatePlan, "id" | "createdAt" | "updatedAt"> => ({
    name: isEs ? "Nuevo plan" : "New plan", technicianId: null, effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: null, active: true, fixedInstallRate: 0, serviceCallRate: 0, emergencyRate: 0,
    mileageRate: 0.67, extraLaborHourlyRate: 0, materialReimbursementPercent: 0, materialReimbursementCap: 0,
    hourlyRate: 0, overtimeMultiplier: 1.5, rules: [], notes: "",
  });

  const create = () => { const id = s.addRatePlan(blankPlan()); setEditId(id); };
  const editing = s.techRatePlans.find((p) => p.id === editId) ?? null;

  return (
    <>
      <Section
        title={isEs ? "Planes de tarifa" : "Rate Plans"}
        action={<Button size="sm" onClick={create}><Plus className="w-4 h-4 mr-2" />{isEs ? "Nuevo plan" : "New rate plan"}</Button>}
      >
        {s.techRatePlans.length === 0 ? (
          <Empty msg={isEs ? "Sin planes de tarifa todavía. Crea uno para que los estados de trabajo auto-completen la tarifa." : "No rate plans yet. Create one so work statements can auto-fill rates."} />
        ) : (
          <div className="space-y-2">
            {s.techRatePlans.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 border border-border rounded-md p-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">
                    {p.name} {!p.active && <Badge variant="outline" className="ml-1">{isEs ? "Inactivo" : "Inactive"}</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.technicianId ? (s.agents.find((a) => a.id === p.technicianId)?.name ?? "—") : (isEs ? "Toda la empresa" : "Company-wide")}
                    {" · "}{fmtMoney(p.fixedInstallRate, s.company.currency)} {isEs ? "instalación" : "install"}
                    {" · "}{p.rules.length} {isEs ? "reglas" : "rules"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => setEditId(p.id)}><Pencil className="w-3.5 h-3.5 mr-1" />{isEs ? "Editar" : "Edit"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm(isEs ? "¿Eliminar este plan?" : "Delete this plan?")) s.removeRatePlan(p.id); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <RateTester technicians={technicians} isEs={isEs} currency={s.company.currency} plans={s.techRatePlans} />

      {editing && <RatePlanDialog plan={editing} technicians={technicians} isEs={isEs} onClose={() => setEditId(null)} />}
    </>
  );
}

function RateTester({ technicians, isEs, currency, plans }: { technicians: Agent[]; isEs: boolean; currency: string; plans: TechRatePlan[] }) {
  const [ctx, setCtx] = useState({ technicianId: "", jobType: "Installation", product: "", territory: "" });
  const result = ctx.technicianId ? resolveRate(plans, ctx) : null;

  return (
    <Section title={isEs ? "Probar tarifa" : "Rate Tester"} desc={isEs ? "Prueba qué tarifa aplicaría a un trabajo específico." : "Test which rate would apply to a specific job."}>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <div><Label className="text-xs">{isEs ? "Técnico" : "Technician"}</Label>
          <Select value={ctx.technicianId || "none"} onValueChange={(v) => setCtx({ ...ctx, technicianId: v === "none" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder={isEs ? "Elegir…" : "Pick…"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {technicians.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">{isEs ? "Tipo de trabajo" : "Job type"}</Label>
          <Select value={ctx.jobType} onValueChange={(v) => setCtx({ ...ctx, jobType: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{JOB_TYPES.map((jt) => <SelectItem key={jt} value={jt}>{jt}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">{isEs ? "Producto" : "Product"}</Label>
          <Input value={ctx.product} onChange={(e) => setCtx({ ...ctx, product: e.target.value })} />
        </div>
        <div><Label className="text-xs">{isEs ? "Territorio" : "Territory"}</Label>
          <Input value={ctx.territory} onChange={(e) => setCtx({ ...ctx, territory: e.target.value })} />
        </div>
      </div>
      {result && (
        <div className="mt-3 rounded-md border border-border/60 px-3 py-2 text-sm">
          <p className="font-mono font-semibold">{fmtMoney(result.baseLaborRate, currency)} <span className="text-xs text-muted-foreground font-normal">+ {fmtMoney(result.mileageRate, currency)}/mi</span></p>
          <p className="text-xs text-muted-foreground">{result.source}</p>
        </div>
      )}
    </Section>
  );
}

function RatePlanDialog({ plan, technicians, isEs, onClose }: { plan: TechRatePlan; technicians: Agent[]; isEs: boolean; onClose: () => void }) {
  const s = useStore();
  const [draft, setDraft] = useState<TechRatePlan>(plan);
  useEffect(() => setDraft(plan), [plan.id]);

  const addRule = () => setDraft({ ...draft, rules: [...draft.rules, { id: crypto.randomUUID(), kind: "job_type", matchValue: "", amount: 0, mode: "amount", mileageRate: null, notes: "" }] });
  const updateRule = (i: number, patch: Partial<RatePlanRule>) => setDraft({ ...draft, rules: draft.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const removeRule = (i: number) => setDraft({ ...draft, rules: draft.rules.filter((_, j) => j !== i) });

  const save = () => { s.updateRatePlan(draft.id, draft); toast.success(isEs ? "Guardado." : "Saved."); onClose(); };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{draft.name}</DialogTitle></DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label className="text-xs">{isEs ? "Nombre" : "Name"}</Label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div><Label className="text-xs">{isEs ? "Técnico (vacío = toda la empresa)" : "Technician (blank = company-wide)"}</Label>
            <Select value={draft.technicianId ?? "none"} onValueChange={(v) => setDraft({ ...draft, technicianId: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{isEs ? "Toda la empresa" : "Company-wide"}</SelectItem>
                {technicians.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">{isEs ? "Vigente desde" : "Effective from"}</Label>
            <Input type="date" value={draft.effectiveFrom} onChange={(e) => setDraft({ ...draft, effectiveFrom: e.target.value })} />
          </div>
          <div><Label className="text-xs">{isEs ? "Vigente hasta (opcional)" : "Effective to (optional)"}</Label>
            <Input type="date" value={draft.effectiveTo ?? ""} onChange={(e) => setDraft({ ...draft, effectiveTo: e.target.value || null })} />
          </div>
          <label className="flex items-center gap-2 text-xs"><Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />{isEs ? "Activo" : "Active"}</label>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div><Label className="text-xs">{isEs ? "Instalación fija" : "Fixed install"}</Label><NumField step="0.01" value={draft.fixedInstallRate} onChange={(n) => setDraft({ ...draft, fixedInstallRate: n })} /></div>
          <div><Label className="text-xs">{isEs ? "Llamada de servicio" : "Service call"}</Label><NumField step="0.01" value={draft.serviceCallRate} onChange={(n) => setDraft({ ...draft, serviceCallRate: n })} /></div>
          <div><Label className="text-xs">{isEs ? "Emergencia" : "Emergency"}</Label><NumField step="0.01" value={draft.emergencyRate} onChange={(n) => setDraft({ ...draft, emergencyRate: n })} /></div>
          <div><Label className="text-xs">{isEs ? "Millaje" : "Mileage"}</Label><NumField step="0.01" value={draft.mileageRate} onChange={(n) => setDraft({ ...draft, mileageRate: n })} /></div>
          <div><Label className="text-xs">{isEs ? "Mano de obra extra/hora" : "Extra labor/hr"}</Label><NumField step="0.01" value={draft.extraLaborHourlyRate} onChange={(n) => setDraft({ ...draft, extraLaborHourlyRate: n })} /></div>
          <div><Label className="text-xs">{isEs ? "Reembolso material %" : "Material reimb. %"}</Label><NumField step="1" value={draft.materialReimbursementPercent * 100} onChange={(n) => setDraft({ ...draft, materialReimbursementPercent: n / 100 })} /></div>
          <div><Label className="text-xs">{isEs ? "Tope reembolso" : "Reimb. cap"}</Label><NumField step="0.01" value={draft.materialReimbursementCap} onChange={(n) => setDraft({ ...draft, materialReimbursementCap: n })} /></div>
          <div><Label className="text-xs">{isEs ? "Tarifa/hora (W-2)" : "Hourly rate (W-2)"}</Label><NumField step="0.01" value={draft.hourlyRate ?? 0} onChange={(n) => setDraft({ ...draft, hourlyRate: n })} /></div>
          <div><Label className="text-xs">{isEs ? "Multiplicador extra" : "OT multiplier"}</Label><NumField step="0.1" value={draft.overtimeMultiplier ?? 1.5} onChange={(n) => setDraft({ ...draft, overtimeMultiplier: n })} /></div>
        </div>

        <div className="mt-4 border-t pt-3">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-semibold">{isEs ? "Reglas (territorio → tipo → producto, el último que aplica gana)" : "Rules (territory → job type → product, the last one applied wins)"}</Label>
            <Button variant="outline" size="sm" onClick={addRule}><Plus className="w-3 h-3 mr-1" />{isEs ? "Agregar regla" : "Add rule"}</Button>
          </div>
          <div className="space-y-2">
            {draft.rules.map((r, i) => (
              <div key={r.id} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end p-2 rounded-md border border-border/60">
                <Select value={r.kind} onValueChange={(v: RateRuleKind) => updateRule(i, { kind: v })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="job_type">{isEs ? "Tipo de trabajo" : "Job type"}</SelectItem>
                    <SelectItem value="product">{isEs ? "Producto" : "Product"}</SelectItem>
                    <SelectItem value="territory">{isEs ? "Territorio" : "Territory"}</SelectItem>
                  </SelectContent>
                </Select>
                <Input className="h-8" placeholder={isEs ? "Valor a igualar" : "Match value"} value={r.matchValue} onChange={(e) => updateRule(i, { matchValue: e.target.value })} />
                <Select value={r.mode ?? "amount"} onValueChange={(v: "amount" | "multiplier") => updateRule(i, { mode: v })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amount">{isEs ? "Monto fijo" : "Fixed amount"}</SelectItem>
                    <SelectItem value="multiplier">{isEs ? "Multiplicador" : "Multiplier"}</SelectItem>
                  </SelectContent>
                </Select>
                <NumField className="h-8" step="0.01" value={r.amount} onChange={(n) => updateRule(i, { amount: n })} />
                <Input className="h-8" placeholder={isEs ? "Notas" : "Notes"} value={r.notes} onChange={(e) => updateRule(i, { notes: e.target.value })} />
                <Button variant="ghost" size="icon" onClick={() => removeRule(i)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
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

/* ========================================================================
 * 3. JOBS
 * ======================================================================== */
export function JobsPanel() {
  const s = useStore();
  const isEs = s.language === "es";
  const techLabel = technicianTerm(s.company, isEs);
  const technicians = s.agents.filter((a) => !!a.classification && a.active !== false);

  const blank = () => ({
    technicianId: null as string | null, customerName: "", billingAddress: "", serviceAddress: "",
    serviceGeo: null as GeoPoint | null, date: new Date().toISOString().slice(0, 10), jobType: "Installation",
    productInstalled: "", territory: "", status: "scheduled" as JobStatus, attachments: [],
    saleInvoiceId: null as string | null, salesAgentId: null as string | null, notes: "",
  });
  const [form, setForm] = useState(blank());
  const [useMyLoc, setUseMyLoc] = useState(false);

  const grabLocation = () => {
    if (!navigator.geolocation) return toast.error(isEs ? "Geolocalización no disponible." : "Geolocation not available.");
    setUseMyLoc(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setForm((f) => ({ ...f, serviceGeo: { lat: pos.coords.latitude, lng: pos.coords.longitude } })); setUseMyLoc(false); },
      () => { toast.error(isEs ? "No se pudo obtener la ubicación." : "Couldn't get location."); setUseMyLoc(false); }
    );
  };

  const create = () => {
    if (!form.customerName.trim()) return toast.error(isEs ? "Falta el nombre del cliente." : "Customer name is required.");
    s.addJob(form);
    setForm(blank());
    toast.success(isEs ? "Job creado." : "Job created.");
  };

  const list = s.jobs.slice().sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <Section title={isEs ? "Nuevo trabajo" : "New job"}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div><Label className="text-xs">{isEs ? `Asignar ${techLabel.toLowerCase()}` : "Assign technician"}</Label>
            <Select value={form.technicianId ?? "none"} onValueChange={(v) => setForm({ ...form, technicianId: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue placeholder={isEs ? "— Sin asignar —" : "— Unassigned —"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{isEs ? "— Sin asignar —" : "— Unassigned —"}</SelectItem>
                {technicians.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {technicians.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">{isEs ? `Sin ${techLabel.toLowerCase()}s activos — agrega uno en la pestaña de Técnicos.` : "No active technicians yet — add one under the Technicians tab."}</p>
            )}
          </div>
          <div><Label className="text-xs">{isEs ? "Cliente" : "Customer"}</Label>
            <Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
          </div>
          <div><Label className="text-xs">{isEs ? "Fecha del trabajo" : "Job date"}</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div><Label className="text-xs">{isEs ? "Tipo de trabajo" : "Job type"}</Label>
            <Select value={form.jobType} onValueChange={(v) => setForm({ ...form, jobType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{JOB_TYPES.map((jt) => <SelectItem key={jt} value={jt}>{jt}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">{isEs ? "Dirección de servicio" : "Service address"}</Label>
            <Input value={form.serviceAddress} onChange={(e) => setForm({ ...form, serviceAddress: e.target.value })} />
          </div>
          <div><Label className="text-xs">{isEs ? "Dirección de facturación" : "Billing address"}</Label>
            <Input value={form.billingAddress} onChange={(e) => setForm({ ...form, billingAddress: e.target.value })} />
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            <Label className="text-xs">{isEs ? "GPS de dirección de servicio" : "Service address GPS"}</Label>
            <div className="flex gap-2 items-center">
              <NumField className="h-9" step="0.000001" value={form.serviceGeo?.lat ?? 0} onChange={(n) => setForm({ ...form, serviceGeo: { lat: n, lng: form.serviceGeo?.lng ?? 0 } })} placeholder="Latitude" />
              <NumField className="h-9" step="0.000001" value={form.serviceGeo?.lng ?? 0} onChange={(n) => setForm({ ...form, serviceGeo: { lat: form.serviceGeo?.lat ?? 0, lng: n } })} placeholder="Longitude" />
              <Button type="button" variant="outline" size="sm" onClick={grabLocation} disabled={useMyLoc}>
                <MapPin className="w-3.5 h-3.5 mr-1" />{isEs ? "Usar mi ubicación" : "Use my location"}
              </Button>
            </div>
          </div>
          <div><Label className="text-xs">{isEs ? "Producto instalado" : "Product installed"}</Label>
            <Input value={form.productInstalled} onChange={(e) => setForm({ ...form, productInstalled: e.target.value })} placeholder={isEs ? "Elegir producto" : "Select product"} list="products-list" />
            <datalist id="products-list">{s.products.map((p) => <option key={p.id} value={p.name} />)}</datalist>
          </div>
          <div><Label className="text-xs">{isEs ? "Vendedor" : "Sales rep"}</Label>
            <Select value={form.salesAgentId ?? "none"} onValueChange={(v) => setForm({ ...form, salesAgentId: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue placeholder={isEs ? "— Ninguno —" : "— None —"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{isEs ? "— Ninguno —" : "— None —"}</SelectItem>
                {s.agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">{isEs ? "Territorio" : "Territory"}</Label>
            <Input value={form.territory} onChange={(e) => setForm({ ...form, territory: e.target.value })} />
          </div>
          <div className="flex items-end">
            <Button onClick={create} className="w-full"><Plus className="w-4 h-4 mr-2" />{isEs ? "Crear job" : "Create job"}</Button>
          </div>
        </div>
      </Section>

      <Section title={`${isEs ? "Trabajos" : "Jobs"} (${list.length})`}>
        {list.length === 0 ? (
          <Empty msg={isEs ? "Sin trabajos todavía." : "No jobs yet."} />
        ) : (
          <div className="space-y-2">
            {list.map((j) => {
              const tech = s.agents.find((a) => a.id === j.technicianId);
              const hasStatement = s.workStatements.some((w) => w.jobId === j.id);
              const hasInvoice = s.customerInvoices.some((ci) => ci.jobId === j.id);
              return (
                <div key={j.id} className="flex items-center justify-between gap-3 border border-border rounded-md p-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{j.number} · {j.customerName}
                      {hasStatement && <Badge variant="secondary" className="ml-2">{isEs ? "Con estado" : "Has statement"}</Badge>}
                      {hasInvoice && <Badge variant="outline" className="ml-1">{isEs ? "Con factura" : "Has invoice"}</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {j.date} · {j.jobType} · {tech?.name ?? (isEs ? "sin asignar" : "unassigned")} · {j.serviceAddress || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Select value={j.status} onValueChange={(v: JobStatus) => s.updateJob(j.id, { status: v })}>
                      <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="scheduled">{isEs ? "Agendado" : "Scheduled"}</SelectItem>
                        <SelectItem value="in_progress">{isEs ? "En progreso" : "In progress"}</SelectItem>
                        <SelectItem value="completed">{isEs ? "Completado" : "Completed"}</SelectItem>
                        <SelectItem value="cancelled">{isEs ? "Cancelado" : "Cancelled"}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm(isEs ? "¿Eliminar este job?" : "Delete this job?")) s.removeJob(j.id); }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}

/* ========================================================================
 * 4. CUSTOMER INVOICES — jobId-based
 * ======================================================================== */
const CI_STATUS_ORDER: CustomerInvoiceStatus[] = ["draft", "sent", "viewed", "partially_paid", "paid", "overdue", "cancelled", "refunded"];
const CI_LABEL_ES: Record<CustomerInvoiceStatus, string> = {
  draft: "Borrador", sent: "Enviado", viewed: "Visto", partially_paid: "Pago parcial",
  paid: "Pagado", overdue: "Vencido", cancelled: "Cancelado", refunded: "Reembolsado",
};
const CI_LABEL_EN: Record<CustomerInvoiceStatus, string> = {
  draft: "Draft", sent: "Sent", viewed: "Viewed", partially_paid: "Partially paid",
  paid: "Paid", overdue: "Overdue", cancelled: "Cancelled", refunded: "Refunded",
};

export function CustomerInvoicesPanel() {
  const s = useStore();
  const isEs = s.language === "es";
  const LABEL = isEs ? CI_LABEL_ES : CI_LABEL_EN;
  const [jobId, setJobId] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [payId, setPayId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | CustomerInvoiceStatus>("all");

  const jobsAvailable = s.jobs.filter((j) => !s.customerInvoices.some((ci) => ci.jobId === j.id));

  const createFromJob = () => { const id = s.createCustomerInvoice(jobId || null); setJobId(""); setEditId(id); };
  const createBlank = () => { const id = s.createCustomerInvoice(null); setEditId(id); };

  const list = s.customerInvoices
    .filter((ci) => filter === "all" || displayCustomerInvoiceStatus(ci) === filter)
    .slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const counts: Record<string, number> = { all: s.customerInvoices.length };
  for (const st of CI_STATUS_ORDER) counts[st] = s.customerInvoices.filter((ci) => displayCustomerInvoiceStatus(ci) === st).length;

  const editing = s.customerInvoices.find((ci) => ci.id === editId) ?? null;
  const paying = s.customerInvoices.find((ci) => ci.id === payId) ?? null;

  return (
    <>
      <Section
        title={isEs ? "Crear factura de cliente" : "Create a customer invoice"}
        desc={isEs ? "Las facturas de cliente son solo documentos de cobro — nunca crean comisión ni duplican la venta." : "Customer invoices are billing documents only — they never create a commission or duplicate sale revenue."}
      >
        <Label className="text-xs font-semibold">{isEs ? "Desde un trabajo" : "From a job"}</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          <Select value={jobId || "none"} onValueChange={(v) => setJobId(v === "none" ? "" : v)}>
            <SelectTrigger className="w-64"><SelectValue placeholder={isEs ? "Elegir job" : "Select a job"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {jobsAvailable.map((j) => <SelectItem key={j.id} value={j.id}>{j.number} · {j.customerName}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" disabled={!jobId} onClick={createFromJob}><Plus className="w-4 h-4 mr-2" />{isEs ? "Crear desde job" : "Create from job"}</Button>
          <Button variant="outline" onClick={createBlank}><Plus className="w-4 h-4 mr-2" />{isEs ? "Factura en blanco" : "Blank invoice"}</Button>
        </div>
      </Section>

      <Section title={`${isEs ? "Facturas de cliente" : "Customer invoices"} (${counts.all})`}>
        <div className="flex flex-wrap gap-2 mb-4">
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>{isEs ? "Todos" : "All"} ({counts.all})</Button>
          {CI_STATUS_ORDER.map((st) => (
            <Button key={st} size="sm" variant={filter === st ? "default" : "outline"} onClick={() => setFilter(st)}>{LABEL[st]} ({counts[st] ?? 0})</Button>
          ))}
        </div>
        {list.length === 0 ? (
          <Empty msg={isEs ? "Sin facturas de cliente todavía." : "No customer invoices yet."} />
        ) : (
          <div className="space-y-3">
            {list.map((ci) => {
              const { total, balance } = customerInvoiceTotals(ci);
              const status = displayCustomerInvoiceStatus(ci);
              return (
                <Card key={ci.id} className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-sm">{ci.number}</span>
                        <span className="text-sm">{ci.customerName || "—"}</span>
                        <Badge variant={status === "paid" ? "default" : status === "overdue" || status === "cancelled" ? "destructive" : "outline"}>{LABEL[status]}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{ci.dueDate && <>{isEs ? "Vence" : "Due"} {ci.dueDate}</>}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold font-mono">{fmtMoney(total, s.company.currency)}</p>
                      <p className="text-xs text-muted-foreground">{isEs ? "Balance" : "Balance"}: <span className={balance > 0 ? "text-destructive font-medium" : ""}>{fmtMoney(balance, s.company.currency)}</span></p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border/50">
                    <Button size="sm" variant="outline" onClick={() => setEditId(ci.id)}><Pencil className="w-3.5 h-3.5 mr-1" />{isEs ? "Editar" : "Edit"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setPayId(ci.id)}><DollarSign className="w-3.5 h-3.5 mr-1" />{isEs ? "Registrar pago" : "Record payment"}</Button>
                    <div className="ml-auto">
                      <Select value={ci.status} onValueChange={(v: CustomerInvoiceStatus) => s.setCustomerInvoiceStatus(ci.id, v)}>
                        <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>{CI_STATUS_ORDER.map((st) => <SelectItem key={st} value={st}>{LABEL[st]}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm(isEs ? "¿Eliminar?" : "Delete?")) s.removeCustomerInvoice(ci.id); }}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      {editing && <CustomerInvoiceEditDialog ci={editing} onClose={() => setEditId(null)} />}
      {paying && <RecordPaymentDialog ci={paying} onClose={() => setPayId(null)} />}
    </>
  );
}

function CustomerInvoiceEditDialog({ ci, onClose }: { ci: CustomerInvoice; onClose: () => void }) {
  const s = useStore();
  const isEs = s.language === "es";
  const [draft, setDraft] = useState<CustomerInvoice>(ci);
  useEffect(() => setDraft(ci), [ci.id]);

  const addLine = () => setDraft({ ...draft, lineItems: [...draft.lineItems, { id: crypto.randomUUID(), productId: null, kind: "product", label: "", quantity: 1, unitPrice: 0 }] });
  const updateLine = (i: number, patch: Partial<CustomerInvoiceLineItem>) => setDraft({ ...draft, lineItems: draft.lineItems.map((li, j) => (j === i ? { ...li, ...patch } : li)) });
  const removeLine = (i: number) => setDraft({ ...draft, lineItems: draft.lineItems.filter((_, j) => j !== i) });

  const { lineTotal, total, balance } = customerInvoiceTotals(draft);
  const save = () => {
    if (!draft.customerName.trim()) return toast.error(isEs ? "Falta el nombre del cliente." : "Customer name is required.");
    s.updateCustomerInvoice(draft.id, draft);
    toast.success(isEs ? "Guardado." : "Saved.");
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{draft.number}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label>{isEs ? "Nombre del cliente" : "Customer name"}</Label><Input value={draft.customerName} onChange={(e) => setDraft({ ...draft, customerName: e.target.value })} /></div>
          <div><Label>Email</Label><Input type="email" value={draft.customerEmail} onChange={(e) => setDraft({ ...draft, customerEmail: e.target.value })} /></div>
          <div><Label>{isEs ? "Dirección de facturación" : "Billing address"}</Label><Input value={draft.billingAddress} onChange={(e) => setDraft({ ...draft, billingAddress: e.target.value })} /></div>
          <div><Label>{isEs ? "Dirección de servicio" : "Service address"}</Label><Input value={draft.serviceAddress} onChange={(e) => setDraft({ ...draft, serviceAddress: e.target.value })} /></div>
          <div><Label>{isEs ? "Fecha" : "Date"}</Label><Input type="date" value={draft.invoiceDate} onChange={(e) => setDraft({ ...draft, invoiceDate: e.target.value })} /></div>
          <div><Label>{isEs ? "Vencimiento" : "Due date"}</Label><Input type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} /></div>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-semibold">{isEs ? "Productos / Servicios" : "Products / Services"}</Label>
            <Button variant="outline" size="sm" onClick={addLine}><Plus className="w-3 h-3 mr-1" />{isEs ? "Agregar línea" : "Add line"}</Button>
          </div>
          <div className="space-y-2">
            {draft.lineItems.map((li, i) => (
              <div key={li.id} className="grid grid-cols-2 sm:grid-cols-[100px_1fr_70px_100px_auto] gap-2 items-center pb-2 mb-1 border-b border-border/50 sm:border-0 sm:pb-0 sm:mb-0">
                <Select value={li.kind} onValueChange={(v: "product" | "service") => updateLine(i, { kind: v })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="product">{isEs ? "Producto" : "Product"}</SelectItem><SelectItem value="service">{isEs ? "Servicio" : "Service"}</SelectItem></SelectContent>
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
          <div><Label className="text-xs">{isEs ? "Descuento" : "Discount"}</Label><NumField step="0.01" value={draft.discount} onChange={(n) => setDraft({ ...draft, discount: n })} /></div>
          <div><Label className="text-xs">{isEs ? "Impuesto %" : "Tax %"}</Label><NumField step="0.1" value={Number((draft.taxPercent * 100).toFixed(4))} onChange={(n) => setDraft({ ...draft, taxPercent: n / 100 })} /></div>
          <div><Label className="text-xs">{isEs ? "Depósito" : "Deposit"}</Label><NumField step="0.01" value={draft.deposit} onChange={(n) => setDraft({ ...draft, deposit: n })} /></div>
          <div><Label className="text-xs">{isEs ? "Financiado" : "Financing applied"}</Label><NumField step="0.01" value={draft.financingApplied} onChange={(n) => setDraft({ ...draft, financingApplied: n })} /></div>
        </div>
        <div className="flex justify-between text-sm mt-3 bg-muted/40 rounded-lg px-4 py-3">
          <span className="text-muted-foreground">{isEs ? "Subtotal" : "Subtotal"}: {fmtMoney(lineTotal, s.company.currency)}</span>
          <span className="font-semibold">{isEs ? "Balance" : "Balance"}: {fmtMoney(balance, s.company.currency)}</span>
          <span className="font-bold text-accent">{isEs ? "Total" : "Total"}: {fmtMoney(total, s.company.currency)}</span>
        </div>
        <div className="grid grid-cols-1 gap-3 mt-4">
          <div><Label className="text-xs">{isEs ? "Términos de pago" : "Payment terms"}</Label><Textarea rows={2} value={draft.paymentTerms} onChange={(e) => setDraft({ ...draft, paymentTerms: e.target.value })} /></div>
          <div><Label className="text-xs">{isEs ? "Garantía" : "Warranty information"}</Label><Textarea rows={2} value={draft.warrantyInfo} onChange={(e) => setDraft({ ...draft, warrantyInfo: e.target.value })} /></div>
          <div><Label className="text-xs">{isEs ? "Notas" : "Notes"}</Label><Textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></div>
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
    s.recordCustomerInvoicePayment(ci.id, { ...form, recordedBy: s.currentUserName });
    toast.success(isEs ? "Pago registrado." : "Payment recorded.");
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isEs ? "Registrar pago" : "Record payment"}</DialogTitle>
          <DialogDescription>{ci.number} — {isEs ? "Balance actual" : "Current balance"}: {fmtMoney(balance, s.company.currency)}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">{isEs ? "Monto" : "Amount"}</Label><NumField step="0.01" value={form.amount} onChange={(n) => setForm({ ...form, amount: n })} /></div>
          <div><Label className="text-xs">{isEs ? "Fecha" : "Date"}</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
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
          <div><Label className="text-xs">{isEs ? "Referencia" : "Reference"}</Label><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
          <div className="col-span-2"><Label className="text-xs">{isEs ? "Notas" : "Notes"}</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
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
 * 5. WORK STATEMENTS — jobId-based, with duplicate-statement protection
 * ======================================================================== */
const WS_LABEL_ES: Record<WorkStatementStatus, string> = { draft: "Borrador", pending_approval: "Pendiente", approved: "Aprobado", rejected: "Rechazado" };
const WS_LABEL_EN: Record<WorkStatementStatus, string> = { draft: "Draft", pending_approval: "Pending approval", approved: "Approved", rejected: "Rejected" };

export function WorkStatementsPanel() {
  const s = useStore();
  const isEs = s.language === "es";
  const LABEL = isEs ? WS_LABEL_ES : WS_LABEL_EN;
  const techLabel = technicianTerm(s.company, isEs);
  const isAdmin = s.role !== "rep" && s.role !== "technician";
  const myAgentId = !isAdmin ? s.activeAgentId : null;

  const [jobId, setJobId] = useState("");
  const [duplicate, setDuplicate] = useState<TechWorkStatement | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const eligibleJobs = isAdmin ? s.jobs : s.jobs.filter((j) => j.technicianId === myAgentId);
  const completedJobs = eligibleJobs.filter((j) => j.status === "completed" || j.status === "in_progress");

  const create = () => {
    if (!jobId) return;
    const res = s.createWorkStatement(jobId);
    if (res.duplicateOf) { setDuplicate(res.duplicateOf); return; }
    if (res.id) { setJobId(""); setEditId(res.id); toast.success(isEs ? "Estado de trabajo creado." : "Work statement created."); }
  };

  const visible = isAdmin ? s.workStatements : s.workStatements.filter((w) => w.technicianId === myAgentId);
  const list = visible.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const editing = s.workStatements.find((w) => w.id === editId) ?? null;
  const rejecting = s.workStatements.find((w) => w.id === rejectId) ?? null;

  return (
    <>
      <Section title={isEs ? "Nuevo estado de trabajo" : "New work statement"}>
        <Label className="text-xs font-semibold">{isEs ? "Trabajo completado" : "Completed job"}</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          <Select value={jobId || "none"} onValueChange={(v) => setJobId(v === "none" ? "" : v)}>
            <SelectTrigger className="w-64"><SelectValue placeholder={isEs ? "Elegir job" : "Select a job"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {completedJobs.map((j) => <SelectItem key={j.id} value={j.id}>{j.number} · {j.customerName}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button disabled={!jobId} onClick={create}><Plus className="w-4 h-4 mr-2" />{isEs ? "Crear estado" : "Create statement"}</Button>
        </div>
        {completedJobs.length === 0 && <p className="text-xs text-muted-foreground mt-1">{isEs ? "No hay jobs asignados todavía." : "No jobs assigned to you yet."}</p>}
        <p className="text-xs text-muted-foreground mt-1">{isEs ? "Las tarifas se auto-completan del plan vigente en la fecha del job, y quedan editables." : "Rates are auto-filled from the technician rate plan effective on the job date, and stay editable."}</p>
      </Section>

      <Section title={`${isEs ? "Estados de trabajo" : "Work statements"} (${list.length})`}>
        {list.length === 0 ? (
          <Empty msg={isEs ? "Sin estados de trabajo todavía." : "No work statements yet."} />
        ) : (
          <div className="space-y-3">
            {list.map((w) => {
              const job = s.jobs.find((j) => j.id === w.jobId);
              const tech = s.agents.find((a) => a.id === w.technicianId);
              const totals = calcWorkStatement(w);
              return (
                <Card key={w.id} className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-sm">{w.number}</span>
                        <span className="text-sm">{tech?.name ?? "—"}</span>
                        <Badge variant={w.status === "approved" ? "default" : w.status === "rejected" ? "destructive" : w.status === "pending_approval" ? "secondary" : "outline"}>{LABEL[w.status]}</Badge>
                        {statementTypeOf(w) !== "original" && <Badge variant="outline">{STATEMENT_TYPES.find((t) => t.id === w.statementType)?.label[isEs ? "es" : "en"]}</Badge>}
                        {!isActiveStatement(w) && <Badge variant="outline">{isEs ? "Inactivo" : "Inactive"}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{job?.number ?? "—"} · {job?.customerName || "—"} {w.rateSnapshot?.ratePlanName ? `· ${w.rateSnapshot.ratePlanName}` : ""}</p>
                    </div>
                    <p className="text-lg font-bold font-mono shrink-0">{fmtMoney(totals.total, s.company.currency)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border/50">
                    <Button size="sm" variant="outline" onClick={() => setEditId(w.id)}><Pencil className="w-3.5 h-3.5 mr-1" />{isEs ? "Editar" : "Edit"}</Button>
                    {w.status === "draft" && (
                      <Button size="sm" variant="outline" onClick={() => { s.submitWorkStatement(w.id, s.currentUserName); toast.success(isEs ? "Enviado." : "Submitted."); }}>{isEs ? "Enviar" : "Submit"}</Button>
                    )}
                    {isAdmin && w.status === "pending_approval" && (
                      <>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => { s.approveWorkStatement(w.id, s.currentUserName); toast.success(isEs ? "Aprobado." : "Approved."); }}>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />{isEs ? "Aprobar" : "Approve"}
                        </Button>
                        <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50" onClick={() => setRejectId(w.id)}>
                          <XCircle className="w-3.5 h-3.5 mr-1" />{isEs ? "Rechazar" : "Reject"}
                        </Button>
                      </>
                    )}
                    {w.attachments.length > 0 && <span className="text-xs text-muted-foreground flex items-center gap-1"><Paperclip className="w-3.5 h-3.5" />{w.attachments.length}</span>}
                    {isAdmin && (
                      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { if (confirm(isEs ? "¿Eliminar?" : "Delete?")) s.removeWorkStatement(w.id); }}><Trash2 className="w-4 h-4" /></Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      {editing && <WorkStatementEditDialog ws={editing} onClose={() => setEditId(null)} readOnly={!isAdmin} />}

      {duplicate && (
        <DuplicateStatementDialog
          existing={duplicate}
          jobId={jobId}
          allowExtraOriginal={s.company.allowMultipleOriginalStatements && isAdmin}
          isEs={isEs}
          onClose={() => setDuplicate(null)}
          onCreate={(statementType, reason) => {
            const res = s.createWorkStatement(jobId, { statementType, typeReason: reason, relatedStatementId: duplicate.id });
            if (res.id) { setDuplicate(null); setJobId(""); setEditId(res.id); }
          }}
        />
      )}

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejectId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{isEs ? "Motivo del rechazo" : "Rejection reason"}</DialogTitle></DialogHeader>
          <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectId(null); setRejectReason(""); }}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button variant="destructive" onClick={() => {
              if (!rejecting) return;
              s.rejectWorkStatement(rejecting.id, s.currentUserName, rejectReason.trim() || (isEs ? "Sin motivo" : "No reason given"));
              setRejectId(null); setRejectReason(""); toast(isEs ? "Rechazado." : "Rejected.");
            }}>{isEs ? "Rechazar" : "Reject"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DuplicateStatementDialog({ existing, allowExtraOriginal, isEs, onClose, onCreate }: {
  existing: TechWorkStatement; jobId: string; allowExtraOriginal: boolean; isEs: boolean;
  onClose: () => void; onCreate: (type: StatementType, reason: string) => void;
}) {
  const options = STATEMENT_TYPES.filter((t) => t.id !== "original" || allowExtraOriginal);
  const [type, setType] = useState<StatementType>(options[0]?.id ?? "supplemental");
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEs ? "Ya existe un estado de trabajo" : "A work statement already exists"}</DialogTitle>
          <DialogDescription>{existing.number} — {isEs ? "para este job, técnico y clasificación." : "for this job, technician and classification."}</DialogDescription>
        </DialogHeader>
        <div>
          <Label className="text-xs">{isEs ? "Tipo de documento" : "Document type"}</Label>
          <Select value={type} onValueChange={(v: StatementType) => setType(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label[isEs ? "es" : "en"]}</SelectItem>)}</SelectContent>
          </Select>
          {type === "original" && (
            <p className="text-xs text-amber-600 mt-1">{isEs ? "Un segundo original necesita aprobación de administrador antes de poder pagarse." : "A second original needs administrator approval before it can be paid."}</p>
          )}
        </div>
        <div className="mt-2">
          <Label className="text-xs">{isEs ? "Motivo" : "Reason"}</Label>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{isEs ? "Cancelar" : "Cancel"}</Button>
          <Button disabled={!reason.trim()} onClick={() => onCreate(type, reason.trim())}>{isEs ? "Crear" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkStatementEditDialog({ ws, onClose, readOnly }: { ws: TechWorkStatement; onClose: () => void; readOnly?: boolean }) {
  const s = useStore();
  const isEs = s.language === "es";
  const [draft, setDraft] = useState<TechWorkStatement>(ws);
  useEffect(() => setDraft(ws), [ws.id]);
  const job = s.jobs.find((j) => j.id === ws.jobId);
  const totals = calcWorkStatement(draft);
  const save = () => { s.updateWorkStatement(draft.id, draft); toast.success(isEs ? "Guardado." : "Saved."); onClose(); };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.number}</DialogTitle>
          <DialogDescription>{job?.customerName || "—"} · {job?.number ?? "—"} · {draft.rateSnapshot?.ratePlanName ?? (isEs ? "Sin plan" : "No plan")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">{isEs ? "Mano de obra base" : "Base labor"}</Label><NumField step="0.01" value={draft.baseLaborRate} onChange={(n) => setDraft({ ...draft, baseLaborRate: n })} disabled={readOnly} /></div>
          <div><Label className="text-xs">{isEs ? "Mano de obra adicional" : "Additional labor"}</Label><NumField step="0.01" value={draft.additionalLabor} onChange={(n) => setDraft({ ...draft, additionalLabor: n })} disabled={readOnly} /></div>
          <div><Label className="text-xs">{isEs ? "Plomería extra" : "Extra plumbing"}</Label><NumField step="0.01" value={draft.extraPlumbing} onChange={(n) => setDraft({ ...draft, extraPlumbing: n })} disabled={readOnly} /></div>
          <div><Label className="text-xs">{isEs ? "Millas" : "Mileage"}</Label><NumField step="1" value={draft.mileageMiles} onChange={(n) => setDraft({ ...draft, mileageMiles: n })} disabled={readOnly} /></div>
          <div><Label className="text-xs">{isEs ? "Reembolso material" : "Material reimbursement"}</Label><NumField step="0.01" value={draft.materialReimbursement} onChange={(n) => setDraft({ ...draft, materialReimbursement: n })} disabled={readOnly} /></div>
          <div><Label className="text-xs">{isEs ? "Deducciones" : "Deductions"}</Label><NumField step="0.01" value={draft.deductions} onChange={(n) => setDraft({ ...draft, deductions: n })} disabled={readOnly} /></div>
          <div><Label className="text-xs">{isEs ? "Contracargos" : "Chargebacks"}</Label><NumField step="0.01" value={draft.chargebacks} onChange={(n) => setDraft({ ...draft, chargebacks: n })} disabled={readOnly} /></div>
          <div><Label className="text-xs">{isEs ? "Correcciones" : "Corrections"}</Label><NumField step="0.01" value={draft.corrections} onChange={(n) => setDraft({ ...draft, corrections: n })} disabled={readOnly} /></div>
          <div><Label className="text-xs">{isEs ? "Horas regulares" : "Regular hours"}</Label><NumField step="0.25" value={draft.regularHours ?? 0} onChange={(n) => setDraft({ ...draft, regularHours: n })} disabled={readOnly} /></div>
          <div><Label className="text-xs">{isEs ? "Horas extra" : "Overtime hours"}</Label><NumField step="0.25" value={draft.overtimeHours ?? 0} onChange={(n) => setDraft({ ...draft, overtimeHours: n })} disabled={readOnly} /></div>
        </div>
        <div className="flex justify-end text-sm mt-2"><span className="font-bold text-accent">{isEs ? "Total a pagar" : "Total due"}: {fmtMoney(totals.total, s.company.currency)}</span></div>
        <div className="mt-3"><Label className="text-xs">{isEs ? "Notas" : "Notes"}</Label><Textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} disabled={readOnly} /></div>
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs font-semibold">{isEs ? "Adjuntos / fotos" : "Attachments / photos"}</Label>
            {!readOnly && <Button variant="outline" size="sm" onClick={() => pickAttachmentFile((a) => s.addWorkStatementAttachment(draft.id, a))}><Paperclip className="w-3.5 h-3.5 mr-1" />{isEs ? "Adjuntar" : "Attach"}</Button>}
          </div>
          {draft.attachments.length === 0 ? <p className="text-xs text-muted-foreground">{isEs ? "Sin adjuntos." : "No attachments."}</p> : (
            <div className="flex flex-wrap gap-2">
              {draft.attachments.map((a) => a.url.startsWith("data:image") ? (
                <img key={a.id} src={a.url} alt={a.name} className="h-16 w-16 object-cover rounded border border-border" />
              ) : (
                <a key={a.id} href={a.url} download={a.name} className="text-xs px-2 py-1 rounded border border-border bg-muted/40">{a.name}</a>
              ))}
            </div>
          )}
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
 * 6. WEEKLY STATEMENTS
 * ======================================================================== */
export function WeeklyStatementsPanel() {
  const s = useStore();
  const isEs = s.language === "es";
  const techLabel = technicianTerm(s.company, isEs);
  const technicians = s.agents.filter((a) => !!a.classification && resolvePaymentTreatment(a) === "contractor_payables");

  const mondayOf = (d: Date) => { const day = d.getDay(); const monday = new Date(d); monday.setDate(d.getDate() - ((day + 6) % 7)); return monday; };
  const [weekStart, setWeekStart] = useState(mondayOf(new Date()).toISOString().slice(0, 10));
  const weekEnd = useMemo(() => { const d = new Date(weekStart); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10); }, [weekStart]);
  const [technicianId, setTechnicianId] = useState("");
  const [payId, setPayId] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ amount: 0, method: "ACH", note: "" });

  const build = () => {
    if (!technicianId) return toast.error(isEs ? `Elige un ${techLabel.toLowerCase()}.` : `Pick a ${techLabel.toLowerCase()}.`);
    const res = s.buildWeeklyStatement(technicianId, weekStart, weekEnd, s.currentUserName);
    if (!res.id) return toast.error(isEs ? "Nada elegible para este período." : "Nothing eligible for this period.");
    toast.success(isEs ? `Statement construido (${res.included} incluidos).` : `Statement built (${res.included} included).`);
  };

  const list = s.weeklyStatements.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const paying = s.weeklyStatements.find((w) => w.id === payId) ?? null;

  return (
    <>
      <Section
        title={isEs ? "Generar estado semanal de técnico" : "Generate weekly technician statement"}
        desc={isEs ? "Solo se incluyen jobs aprobados que no estén ya en otro lote activo." : "Only approved jobs that are not already inside another active weekly batch are included."}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div><Label className="text-xs">{isEs ? "Semana que inicia (lun)" : "Week starting (Mon)"}</Label>
            <Input type="date" value={weekStart} onChange={(e) => setWeekStart(mondayOf(new Date(e.target.value)).toISOString().slice(0, 10))} />
            <p className="text-xs text-muted-foreground mt-1">→ {weekEnd}</p>
          </div>
          <div><Label className="text-xs">{techLabel}</Label>
            <Select value={technicianId || "none"} onValueChange={(v) => setTechnicianId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder={isEs ? "Elegir…" : "Select…"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {technicians.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={build}><CalendarRange className="w-4 h-4 mr-2" />{isEs ? "Construir statement" : "Build statement"}</Button>
        </div>
      </Section>

      <Section title={isEs ? "Statements semanales" : "Weekly statements"}>
        {list.length === 0 ? <Empty msg={isEs ? "Sin statements todavía." : "No weekly statements yet."} /> : (
          <div className="space-y-3">
            {list.map((w) => {
              const tech = s.agents.find((a) => a.id === w.technicianId);
              return (
                <Card key={w.id} className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-sm">{w.number}</span>
                        <span className="text-sm">{tech?.name ?? "—"}</span>
                        <Badge variant={w.status === "paid" ? "default" : w.status === "approved" ? "secondary" : "outline"}>{w.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><CalendarRange className="w-3 h-3" />{w.weekStart} – {w.weekEnd} · {w.statementIds.length} {isEs ? "estados" : "statements"}</p>
                    </div>
                    <p className="text-lg font-bold font-mono">{fmtMoney(w.totals.total, s.company.currency)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border/50">
                    {w.status === "draft" && <Button size="sm" onClick={() => { s.approveWeeklyStatement(w.id, s.currentUserName); toast.success(isEs ? "Aprobado." : "Approved."); }}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />{isEs ? "Aprobar" : "Approve"}</Button>}
                    {w.status === "approved" && <Button size="sm" onClick={() => { setPayId(w.id); setPayForm({ amount: w.totals.total, method: "ACH", note: "" }); }}><DollarSign className="w-3.5 h-3.5 mr-1" />{isEs ? "Marcar pagado" : "Mark paid"}</Button>}
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { if (confirm(isEs ? "¿Eliminar? Los estados quedarán elegibles de nuevo." : "Delete? Its statements become eligible again.")) s.removeWeeklyStatement(w.id); }}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      <Dialog open={!!paying} onOpenChange={(o) => !o && setPayId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{isEs ? "Marcar como pagado" : "Mark as paid"}</DialogTitle><DialogDescription>{paying?.number}</DialogDescription></DialogHeader>
          <div><Label className="text-xs">{isEs ? "Monto" : "Amount"}</Label><NumField step="0.01" value={payForm.amount} onChange={(n) => setPayForm({ ...payForm, amount: n })} /></div>
          <div><Label className="text-xs">{isEs ? "Método" : "Method"}</Label><Input value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })} /></div>
          <div><Label className="text-xs">{isEs ? "Referencia" : "Note"}</Label><Input value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayId(null)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={() => { if (!paying) return; s.markWeeklyStatementPaid(paying.id, payForm); setPayId(null); toast.success(isEs ? "Marcado como pagado." : "Marked as paid."); }}>{isEs ? "Confirmar" : "Confirm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ========================================================================
 * 7. COMPANY PAYABLES — internal report only
 * ======================================================================== */
export function CompanyPayablesPanel() {
  const s = useStore();
  const isEs = s.language === "es";
  const mondayOf = (d: Date) => { const day = d.getDay(); const monday = new Date(d); monday.setDate(d.getDate() - ((day + 6) % 7)); return monday; };
  const [weekStart, setWeekStart] = useState(mondayOf(new Date()).toISOString().slice(0, 10));
  const weekEnd = useMemo(() => { const d = new Date(weekStart); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10); }, [weekStart]);

  const technicians = s.agents.filter((a) => !!a.classification);
  const summary = buildPayablesSummary(technicians, s.workStatements, s.jobs, weekStart, weekEnd);
  const weekNumber = useMemo(() => {
    const d = new Date(weekStart);
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const wk = Math.ceil((((d.getTime() - jan1.getTime()) / 86400000) + jan1.getDay() + 1) / 7);
    return `TPS-${d.getFullYear()}-W${String(wk).padStart(2, "0")}`;
  }, [weekStart]);

  const exportCSV = () => {
    const rows: (string | number)[][] = [["Technician", "Jobs", "Base labor", "Extras", "Reimbursements", "Deductions", "Total payable"]];
    for (const r of summary.rows) rows.push([r.technicianName, r.jobs, r.base.toFixed(2), r.extras.toFixed(2), r.reimbursements.toFixed(2), r.deductions.toFixed(2), r.total.toFixed(2)]);
    downloadCSV(`${weekNumber}_company_payables.csv`, rows);
  };

  return (
    <Section
      title={`${isEs ? "Pagos de técnicos de la compañía" : "Company technician payables"} — ${weekNumber}`}
      desc={isEs ? "Reporte interno. Los técnicos nunca ven esta página." : "Internal report. Technicians never see this page."}
      action={
        <div className="flex items-end gap-2">
          <div><Label className="text-xs">{isEs ? "Semana que inicia" : "Week starting"}</Label><Input type="date" className="h-9" value={weekStart} onChange={(e) => setWeekStart(mondayOf(new Date(e.target.value)).toISOString().slice(0, 10))} /></div>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!summary.rows.length}><FileDown className="w-3.5 h-3.5 mr-1" />CSV</Button>
        </div>
      }
    >
      {summary.rows.length === 0 ? <Empty msg={isEs ? "No hay jobs aprobados esta semana." : "No approved jobs in this week."} /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground uppercase">
              <tr>
                <th className="py-2">{isEs ? "Técnico" : "Technician"}</th>
                <th className="text-right">{isEs ? "Jobs" : "Jobs"}</th>
                <th className="text-right">{isEs ? "Mano de obra" : "Base labor"}</th>
                <th className="text-right">{isEs ? "Extras" : "Extras"}</th>
                <th className="text-right">{isEs ? "Reembolsos" : "Reimbursements"}</th>
                <th className="text-right">{isEs ? "Deducciones" : "Deductions"}</th>
                <th className="text-right">{isEs ? "Total a pagar" : "Total payable"}</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((r) => (
                <tr key={r.technicianId} className="border-t border-border/60">
                  <td className="py-2 font-medium">{r.technicianName}</td>
                  <td className="text-right font-mono">{r.jobs}</td>
                  <td className="text-right font-mono">{fmtMoney(r.base, s.company.currency)}</td>
                  <td className="text-right font-mono">{fmtMoney(r.extras, s.company.currency)}</td>
                  <td className="text-right font-mono">{fmtMoney(r.reimbursements, s.company.currency)}</td>
                  <td className="text-right font-mono text-destructive">-{fmtMoney(r.deductions, s.company.currency)}</td>
                  <td className="text-right font-mono font-bold">{fmtMoney(r.total, s.company.currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-bold">
                <td className="py-2">{isEs ? "Total de la compañía" : "Company total"}</td>
                <td className="text-right font-mono">{summary.totalJobs}</td>
                <td colSpan={4}></td>
                <td className="text-right font-mono">{fmtMoney(summary.totalPayable, s.company.currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Section>
  );
}

/* ========================================================================
 * 8. PAYROLL REGISTER & EXPORT — W-2 only
 * ======================================================================== */
export function PayrollPanel() {
  const s = useStore();
  const isEs = s.language === "es";
  const [periodStart, setPeriodStart] = useState(new Date().toISOString().slice(0, 10));
  const [frequency, setFrequency] = useState<"weekly" | "biweekly">("weekly");
  const periodEnd = useMemo(() => {
    const d = new Date(periodStart); d.setDate(d.getDate() + (frequency === "weekly" ? 6 : 13));
    return d.toISOString().slice(0, 10);
  }, [periodStart, frequency]);
  const [payDate, setPayDate] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [openId, setOpenId] = useState<string | null>(null);

  const build = () => {
    const id = s.buildPayrollRun(periodStart, periodEnd, payDate, frequency);
    setOpenId(id);
    toast.success(isEs ? "Nómina creada." : "Payroll run created.");
  };

  const list = s.payrollRuns.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const open = s.payrollRuns.find((r) => r.id === openId) ?? null;

  const addWithholding = () => s.setCompany({ withholdingRates: [...s.company.withholdingRates, { id: crypto.randomUUID(), label: isEs ? "Retención personalizada" : "Custom withholding", percent: 0, active: true }] });
  const updateWithholding = (id: string, patch: Partial<{ label: string; percent: number; active: boolean }>) =>
    s.setCompany({ withholdingRates: s.company.withholdingRates.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const removeWithholding = (id: string) => s.setCompany({ withholdingRates: s.company.withholdingRates.filter((r) => r.id !== id) });

  return (
    <>
      <Section title={isEs ? "Nueva nómina (empleados W-2)" : "New payroll register (W-2 employees)"}>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div><Label className="text-xs">{isEs ? "Inicio del período" : "Period start"}</Label><Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></div>
          <div><Label className="text-xs">{isEs ? "Frecuencia" : "Frequency"}</Label>
            <Select value={frequency} onValueChange={(v: "weekly" | "biweekly") => setFrequency(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="weekly">{isEs ? "Semanal" : "Weekly"}</SelectItem><SelectItem value="biweekly">{isEs ? "Quincenal" : "Biweekly"}</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">{isEs ? "Fin del período" : "Period end"}</Label><Input type="date" value={periodEnd} disabled /></div>
          <div><Label className="text-xs">{isEs ? "Fecha de pago" : "Pay date"}</Label><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
          <div className="sm:col-span-4"><Button onClick={build}><CalendarRange className="w-4 h-4 mr-2" />{isEs ? "Construir nómina" : "Build register"}</Button></div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          {isEs
            ? "Toma los estados de trabajo aprobados y sus horas en el período. Las facturas de cliente de esos mismos jobs se muestran solo como referencia y nunca se suman al pago. Las líneas de contratista (1099) se marcan y se excluyen del export de nómina — se les paga por pagos a contratistas."
            : "Pulls approved technician work statements and their hours in the period. Customer invoices on the same jobs are shown as reference revenue only and never added to pay. Contractor (1099) lines are marked and excluded from the payroll export — they are paid through contractor payables."}
        </p>
        <p className="text-xs text-muted-foreground mt-2 italic">
          {isEs ? "Esta pantalla prepara información de nómina para revisión y exportación. La retención final, la declaración y el procesamiento deben completarse con un proveedor de nómina autorizado o un profesional calificado." : "This screen prepares payroll information for review and export. Final withholding, filing and payroll processing must be completed through an authorized payroll provider or qualified professional."}
        </p>
      </Section>

      <Section title={isEs ? "Tasas de retención (estimado interno)" : "Tax withholding rates (internal estimate only)"} action={<Button size="sm" variant="outline" onClick={addWithholding}><Plus className="w-3.5 h-3.5 mr-1" />{isEs ? "Agregar" : "Add"}</Button>}>
        <div className="space-y-2">
          {s.company.withholdingRates.map((r) => (
            <div key={r.id} className="grid grid-cols-[1fr_100px_auto_auto] gap-2 items-center">
              <Input value={r.label} onChange={(e) => updateWithholding(r.id, { label: e.target.value })} />
              <NumField step="0.1" value={r.percent * 100} onChange={(n) => updateWithholding(r.id, { percent: n / 100 })} />
              <Switch checked={r.active} onCheckedChange={(v) => updateWithholding(r.id, { active: v })} />
              <Button variant="ghost" size="icon" onClick={() => removeWithholding(r.id)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
        </div>
      </Section>

      <Section title={isEs ? "Registros de nómina" : "Payroll registers"}>
        {list.length === 0 ? <Empty msg={isEs ? "Sin registros todavía." : "No registers yet."} /> : (
          <div className="space-y-3">
            {list.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1"><span className="font-semibold text-sm">{r.number}</span><Badge variant={r.status === "paid" ? "default" : r.status === "approved" ? "secondary" : "outline"}>{r.status}</Badge></div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><CalendarRange className="w-3 h-3" />{r.periodStart} – {r.periodEnd} · {r.lines.length} {isEs ? "líneas" : "lines"}</p>
                  </div>
                  <p className="text-lg font-bold font-mono">{fmtMoney(r.lines.reduce((a, l) => a + payrollLineNet(l), 0), s.company.currency)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border/50">
                  <Button size="sm" variant="outline" onClick={() => setOpenId(r.id)}><Pencil className="w-3.5 h-3.5 mr-1" />{isEs ? "Abrir" : "Open"}</Button>
                  {r.status === "draft" && <Button size="sm" onClick={() => { s.approvePayrollRun(r.id, s.currentUserName); toast.success(isEs ? "Aprobado." : "Approved."); }}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />{isEs ? "Aprobar" : "Approve"}</Button>}
                  {r.status === "approved" && <Button size="sm" onClick={() => { s.markPayrollRunPaid(r.id); toast.success(isEs ? "Marcado como pagado." : "Marked as paid."); }}><DollarSign className="w-3.5 h-3.5 mr-1" />{isEs ? "Marcar pagado" : "Mark paid"}</Button>}
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { if (confirm(isEs ? "¿Eliminar?" : "Delete?")) s.removePayrollRun(r.id); }}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>

      {open && <PayrollRunDialog run={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

function PayrollRunDialog({ run, onClose }: { run: import("@/lib/commission-store").PayrollRun; onClose: () => void }) {
  const s = useStore();
  const isEs = s.language === "es";

  const exportProviderCSV = () => {
    const lines = run.lines.filter((l) => !l.is1099);
    if (!lines.length) return toast.error(isEs ? "Sin líneas W-2 en esta nómina." : "No W-2 employee lines in this run");
    const rows: (string | number)[][] = [["Run", "Period start", "Period end", "Pay date", "Employee", "Classification", "Jobs", "Regular hours", "Overtime hours", "Gross wages", "Reimbursements", "Deductions"]];
    for (const l of lines) rows.push([run.number, run.periodStart, run.periodEnd, run.payDate, l.technicianName, l.classification, l.jobs, l.regularHours, l.overtimeHours, (l.laborPay).toFixed(2), l.reimbursements.toFixed(2), l.deductions.toFixed(2)]);
    downloadCSV(`${run.number}_payroll_provider.csv`, rows);
  };
  const exportFullCSV = () => {
    const rows: (string | number)[][] = [["Employee", "Type", "Classification", "Jobs", "Gross", "Reimbursements", "Deductions", "Withheld", "Net pay", "Customer invoiced (ref)"]];
    const sorted = run.lines.slice().sort((a, b) => Number(a.is1099) - Number(b.is1099));
    for (const l of sorted) {
      const withheld = l.withholdings.reduce((a, w) => a + w.amount, 0);
      rows.push([l.technicianName, l.is1099 ? "1099" : "W-2", l.classification, l.jobs, l.laborPay.toFixed(2), l.reimbursements.toFixed(2), l.deductions.toFixed(2), withheld.toFixed(2), payrollLineNet(l).toFixed(2), l.customerInvoiced.toFixed(2)]);
    }
    downloadCSV(`${run.number}_full_register.csv`, rows);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{run.number}</DialogTitle><DialogDescription>{run.periodStart} – {run.periodEnd}</DialogDescription></DialogHeader>
        <p className="text-xs text-muted-foreground italic bg-muted/40 rounded-lg px-3 py-2">{isEs ? "La retención mostrada es solo un estimado interno." : "Withholding shown is an internal estimate only."}</p>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground uppercase">
              <tr>
                <th className="py-1">{isEs ? "Empleado" : "Employee"}</th>
                <th>{isEs ? "Tipo" : "Type"}</th>
                <th className="text-right">{isEs ? "Bruto" : "Gross"}</th>
                <th className="text-right">{isEs ? "Reembolsos" : "Reimb."}</th>
                <th className="text-right">{isEs ? "Deducciones" : "Deduct."}</th>
                <th className="text-right">{isEs ? "Retenido" : "Withheld"}</th>
                <th className="text-right">{isEs ? "Neto" : "Net"}</th>
              </tr>
            </thead>
            <tbody>
              {run.lines.map((l) => (
                <tr key={l.id} className="border-t border-border/60">
                  <td className="py-1 font-medium">{l.technicianName}</td>
                  <td>{l.is1099 ? "1099" : "W-2"}</td>
                  <td className="text-right font-mono">{fmtMoney(l.laborPay, s.company.currency)}</td>
                  <td className="text-right font-mono">{fmtMoney(l.reimbursements, s.company.currency)}</td>
                  <td className="text-right font-mono">{fmtMoney(l.deductions, s.company.currency)}</td>
                  <td className="text-right font-mono">{fmtMoney(l.withholdings.reduce((a, w) => a + w.amount, 0), s.company.currency)}</td>
                  <td className="text-right font-mono font-semibold">{fmtMoney(payrollLineNet(l), s.company.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap justify-between items-center gap-2 mt-3">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportProviderCSV}><FileDown className="w-3.5 h-3.5 mr-1" />{isEs ? "Export proveedor" : "Provider export"}</Button>
            <Button variant="outline" size="sm" onClick={exportFullCSV}><FileDown className="w-3.5 h-3.5 mr-1" />{isEs ? "Registro completo" : "Full register"}</Button>
          </div>
          <span className="font-bold text-accent">{isEs ? "Total del registro" : "Register total"}: {fmtMoney(run.lines.reduce((a, l) => a + payrollLineNet(l), 0), s.company.currency)}</span>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>{isEs ? "Cerrar" : "Close"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ========================================================================
 * 9. TAX FILING — Form 1099-NEC
 * ======================================================================== */
export function TaxFilingPanel() {
  const s = useStore();
  const isEs = s.language === "es";
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

  const rows = useMemo(
    () => compute1099Rows(year, s.agents, s.weeklyStatements, s.workStatements, s.customerInvoices, s.payrollRuns),
    [year, s.agents, s.weeklyStatements, s.workStatements, s.customerInvoices, s.payrollRuns]
  );
  const need1099 = rows.filter((r) => r.is1099 && r.total >= 600);
  const totals = {
    box1: rows.reduce((a, r) => a + r.total, 0),
    box4: rows.reduce((a, r) => a + r.federalWithheld, 0),
    box5: rows.reduce((a, r) => a + r.stateWithheld, 0),
  };

  const exportSummary = () => {
    const csvRows: (string | number)[][] = [["Technician", "Classification", "Type", "Box 1 Compensation", "Box 4 Federal withheld", "Box 5 State withheld"]];
    for (const r of rows) csvRows.push([r.technicianName, r.classification, r.is1099 ? "1099-NEC" : "W-2", r.total.toFixed(2), r.federalWithheld.toFixed(2), r.stateWithheld.toFixed(2)]);
    downloadCSV(`${year}_tax_filing_summary.csv`, csvRows);
  };

  return (
    <>
      <Section
        title={isEs ? "Declaración de impuestos — Formulario 1099-NEC" : "Tax filing — Form 1099-NEC"}
        desc={isEs ? "Los montos federales y estatales vienen de nóminas pagadas; la compensación son los estados semanales de técnico realmente pagados en el año (base de efectivo)." : "Federal and state amounts come from paid payroll runs; compensation is the weekly technician statements actually paid in the year (cash basis)."}
        action={
          <div className="flex items-center gap-2">
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportSummary} disabled={!rows.length}><FileDown className="w-3.5 h-3.5 mr-1" />{isEs ? "CSV resumen" : "Summary CSV"}</Button>
            <Button size="sm" disabled={!need1099.length}><Shield className="w-3.5 h-3.5 mr-1" />{isEs ? "Todos los 1099-NEC" : "All 1099-NEC forms"}</Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="rounded-lg border border-border/60 p-3 text-center"><p className="text-xs text-muted-foreground">Box 1 {isEs ? "Compensación total" : "total compensation"}</p><p className="text-lg font-bold font-mono">{fmtMoney(totals.box1, s.company.currency)}</p></div>
          <div className="rounded-lg border border-border/60 p-3 text-center"><p className="text-xs text-muted-foreground">Box 4 {isEs ? "Retenido federal" : "federal withheld"}</p><p className="text-lg font-bold font-mono">{fmtMoney(totals.box4, s.company.currency)}</p></div>
          <div className="rounded-lg border border-border/60 p-3 text-center"><p className="text-xs text-muted-foreground">Box 5 {isEs ? "Retenido estatal" : "state withheld"}</p><p className="text-lg font-bold font-mono">{fmtMoney(totals.box5, s.company.currency)}</p></div>
          <div className="rounded-lg border border-border/60 p-3 text-center"><p className="text-xs text-muted-foreground">{isEs ? "Formularios a presentar" : "Forms to file"}</p><p className="text-lg font-bold font-mono">{need1099.length}</p></div>
        </div>

        {rows.length === 0 ? (
          <Empty msg={isEs ? `Sin pagos a técnicos registrados en ${year}.` : `No technician payments recorded in ${year}.`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground uppercase">
                <tr><th className="py-2">{isEs ? "Técnico" : "Technician"}</th><th>{isEs ? "Tipo" : "Type"}</th><th className="text-right">Box 1</th><th className="text-right">Box 4</th><th className="text-right">Box 5</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="py-2 font-medium">{r.technicianName}</td>
                    <td><Badge variant={r.is1099 ? "outline" : "secondary"}>{r.is1099 ? "1099-NEC" : "W-2"}</Badge></td>
                    <td className="text-right font-mono">{fmtMoney(r.total, s.company.currency)}</td>
                    <td className="text-right font-mono">{fmtMoney(r.federalWithheld, s.company.currency)}</td>
                    <td className="text-right font-mono">{fmtMoney(r.stateWithheld, s.company.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          {isEs ? "Los técnicos se pagan como contratistas, así que solo se produce el Formulario 1099-NEC. Verifica los datos de cada destinatario en su Formulario W-9 antes de presentar." : "Technicians are paid as contractors, so only Form 1099-NEC is produced. Verify each recipient's details on Form W-9 before filing."}
        </p>
      </Section>
    </>
  );
}
