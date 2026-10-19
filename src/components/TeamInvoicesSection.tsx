import { useEffect, useState, type ComponentProps } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  useStore, type Invoice, type InvoiceReviewStatus,
  invoiceReviewStatus, invoiceReviewDeadline,
} from "@/lib/commission-store";
import { calcInvoice, fmtMoney } from "@/lib/commission-calc";

function NumField({ value, onChange, className, ...props }: {
  value: number; onChange: (n: number) => void; className?: string;
} & Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type">) {
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

function ReviewBadge({ status, deadline, reviewedBy, isEs }: {
  status: InvoiceReviewStatus; deadline: Date; reviewedBy?: string | null; isEs: boolean;
}) {
  // Ticks on its own every 30s so the countdown actually counts down while
  // the page sits open, instead of only updating on the next unrelated
  // re-render — invoiceReviewStatus() itself is always computed fresh, this
  // just makes sure something asks it to.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (status !== "pending") return;
    const id = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [status]);

  if (status === "reviewed") {
    return <Badge>{isEs ? `Revisado por ${reviewedBy ?? "—"}` : `Reviewed by ${reviewedBy ?? "—"}`}</Badge>;
  }
  if (status === "auto_approved") {
    return <Badge variant="outline">{isEs ? "Aprobado automático (venció el plazo)" : "Auto-approved (window expired)"}</Badge>;
  }
  const minutesLeft = Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / (60 * 1000)));
  const timeLabel = minutesLeft >= 60
    ? `${Math.ceil(minutesLeft / 60)}h`
    : (isEs ? `${minutesLeft}min` : `${minutesLeft}min`);
  return <Badge variant="secondary">{isEs ? `Pendiente · vence en ${timeLabel}` : `Pending · due in ${timeLabel}`}</Badge>;
}

/** A sponsor's view of their whole downline's invoices — available to
 * whoever has people under them in the sponsor tree, regardless of their
 * login role (rep, analyst, technician, ...). 24h from each invoice's
 * creation to approve it, or add a discount/credit against their OWN
 * override on that sale (same overrideDeductions/overrideCredits data the
 * admin "Who's involved" dialog edits — just keyed to this viewer's own
 * agentId, and only reachable for invoices in their downline). Nothing else
 * on the invoice is editable from here. */
export function TeamInvoicesSection({ downlineIds, myAgentId }: { downlineIds: Set<string>; myAgentId: string }) {
  const s = useStore();
  const isEs = s.language === "es";
  const [addingFor, setAddingFor] = useState<{ invoiceId: string; kind: "deduction" | "credit" } | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftAmount, setDraftAmount] = useState(0);

  const list = s.invoices
    .filter((i) => downlineIds.has(i.agentId))
    .slice()
    .sort((a, b) => (b.createdAt ?? b.date).localeCompare(a.createdAt ?? a.date));

  const cancelDraft = () => { setAddingFor(null); setDraftLabel(""); setDraftAmount(0); };

  const myName = s.agents.find((a) => a.id === myAgentId)?.name ?? s.currentUserName;

  const addEntry = (inv: Invoice, kind: "deduction" | "credit") => {
    const label = draftLabel.trim();
    if (!label || !draftAmount) return;
    const field = kind === "deduction" ? "overrideDeductions" : "overrideCredits";
    const existing = inv[field]?.[myAgentId] ?? [];
    s.updateInvoice(inv.id, {
      [field]: {
        ...(inv[field] || {}),
        [myAgentId]: [...existing, { id: crypto.randomUUID(), label, amount: draftAmount, addedBy: s.currentUserName, addedAt: new Date().toISOString() }],
      },
    } as Partial<Invoice>);
    s.addNotification({
      kind: "team_invoice_reviewed",
      title: isEs
        ? `${myName} ${kind === "deduction" ? "agregó un descuento" : "agregó un crédito"}`
        : `${myName} added a ${kind === "deduction" ? "deduction" : "credit"}`,
      message: `${inv.number} (${inv.customerName || "—"}) — ${label}: ${kind === "deduction" ? "-" : "+"}${fmtMoney(draftAmount, s.company.currency)}`,
      audience: "admin",
      invoiceId: inv.id,
    });
    cancelDraft();
  };

  const removeEntry = (inv: Invoice, kind: "deduction" | "credit", id: string) => {
    const field = kind === "deduction" ? "overrideDeductions" : "overrideCredits";
    const remaining = (inv[field]?.[myAgentId] ?? []).filter((d) => d.id !== id);
    const next = { ...(inv[field] || {}) };
    if (remaining.length) next[myAgentId] = remaining; else delete next[myAgentId];
    s.updateInvoice(inv.id, { [field]: next } as Partial<Invoice>);
  };

  const approve = (inv: Invoice) => {
    s.markInvoiceManagerReviewed(inv.id, s.currentUserName);
    s.addNotification({
      kind: "team_invoice_reviewed",
      title: isEs ? `${myName} aprobó un invoice de equipo` : `${myName} approved a team invoice`,
      message: `${inv.number} (${inv.customerName || "—"})`,
      audience: "admin",
      invoiceId: inv.id,
    });
    toast.success(isEs ? "Invoice aprobado." : "Invoice approved.");
  };

  return (
    <Card className="p-6 shadow-card">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">{isEs ? "Invoices de equipo" : "Team invoices"}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {isEs
            ? "Invoices de toda tu línea. Tienes 24 horas desde que se crean para aprobarlos o agregarles un descuento/crédito a tu propio override — si no haces nada, quedan aprobados solos."
            : "Invoices from your whole downline. You have 24h from creation to approve them or add a discount/credit to your own override — if you don't act, they're approved automatically."}
        </p>
      </div>

      {list.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
          {isEs ? "Sin invoices de tu equipo todavía." : "No team invoices yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((inv) => {
            const ag = s.agents.find((a) => a.id === inv.agentId);
            const c = calcInvoice(inv, s.financeCompanies);
            const reviewStatus = invoiceReviewStatus(inv);
            const deadline = invoiceReviewDeadline(inv);
            const myDeductions = inv.overrideDeductions?.[myAgentId] ?? [];
            const myCredits = inv.overrideCredits?.[myAgentId] ?? [];
            // Seeing your whole downline here is fine (oversight), but
            // approving/discounting a sale is the DIRECT sponsor's call only
            // — someone two levels up (e.g. Jose over Kevin over Sara) can
            // look at Sara's invoice but not act on it, that's Kevin's job.
            const isDirectReport = ag?.sponsorId === myAgentId;
            const directSponsorName = s.agents.find((a) => a.id === ag?.sponsorId)?.name;
            return (
              <Card key={inv.id} className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm">{inv.number}</span>
                      <span className="text-sm">{inv.customerName || "—"}</span>
                      <span className="text-xs text-muted-foreground">{ag?.name ?? "—"}</span>
                    </div>
                    <ReviewBadge status={reviewStatus} deadline={deadline} reviewedBy={inv.managerReviewedBy} isEs={isEs} />
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono font-semibold">{fmtMoney(c.profit - c.adminFeeAmount, s.company.currency)}</p>
                    <p className="text-xs text-muted-foreground">{isEs ? "Profit" : "Profit"}</p>
                  </div>
                </div>

                {(myDeductions.length > 0 || myCredits.length > 0) && (
                  <div className="space-y-1 mt-3 pt-3 border-t border-border/50">
                    {myDeductions.map((d) => (
                      <div key={d.id} className="flex items-center justify-between text-xs bg-destructive/5 rounded px-2 py-1">
                        <span className="truncate">{d.label}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-destructive">-{fmtMoney(d.amount, s.company.currency)}</span>
                          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => removeEntry(inv, "deduction", d.id)}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </div>
                    ))}
                    {myCredits.map((cr) => (
                      <div key={cr.id} className="flex items-center justify-between text-xs bg-emerald-500/5 rounded px-2 py-1">
                        <span className="truncate">{cr.label}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-emerald-600">+{fmtMoney(cr.amount, s.company.currency)}</span>
                          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => removeEntry(inv, "credit", cr.id)}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border/50">
                  {!isDirectReport ? (
                    <p className="text-xs text-muted-foreground">
                      {isEs
                        ? `Solo puedes ver este invoice — el sponsor directo de ${ag?.name ?? "—"} es ${directSponsorName ?? "—"}.`
                        : `View only — ${ag?.name ?? "—"}'s direct sponsor is ${directSponsorName ?? "—"}.`}
                    </p>
                  ) : reviewStatus !== "pending" ? (
                    <p className="text-xs text-muted-foreground">
                      {isEs ? "La ventana de revisión ya se cerró." : "The review window is closed."}
                    </p>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => approve(inv)}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />{isEs ? "Aprobar" : "Approve"}
                      </Button>
                      {addingFor?.invoiceId === inv.id && addingFor.kind === "deduction" ? (
                        <div className="flex items-center gap-2">
                          <Input className="h-8 w-40" placeholder={isEs ? "Nombre del descuento" : "Deduction name"} value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} autoFocus />
                          <NumField className="h-8 w-24" value={draftAmount} onChange={setDraftAmount} />
                          <Button size="sm" onClick={() => addEntry(inv, "deduction")}>{isEs ? "Agregar" : "Add"}</Button>
                          <Button size="sm" variant="ghost" onClick={cancelDraft}>{isEs ? "Cancelar" : "Cancel"}</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => { setAddingFor({ invoiceId: inv.id, kind: "deduction" }); setDraftLabel(""); setDraftAmount(0); }}>
                          <Plus className="w-3.5 h-3.5 mr-1" />{isEs ? "Descuento" : "Deduction"}
                        </Button>
                      )}
                      {addingFor?.invoiceId === inv.id && addingFor.kind === "credit" ? (
                        <div className="flex items-center gap-2">
                          <Input className="h-8 w-40" placeholder={isEs ? "Nombre del crédito" : "Credit name"} value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} autoFocus />
                          <NumField className="h-8 w-24" value={draftAmount} onChange={setDraftAmount} />
                          <Button size="sm" onClick={() => addEntry(inv, "credit")}>{isEs ? "Agregar" : "Add"}</Button>
                          <Button size="sm" variant="ghost" onClick={cancelDraft}>{isEs ? "Cancelar" : "Cancel"}</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" className="text-emerald-600 hover:text-emerald-700" onClick={() => { setAddingFor({ invoiceId: inv.id, kind: "credit" }); setDraftLabel(""); setDraftAmount(0); }}>
                          <Plus className="w-3.5 h-3.5 mr-1" />{isEs ? "Crédito" : "Credit"}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Card>
  );
}
