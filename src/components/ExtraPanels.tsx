import { useMemo, useState, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Wallet, FileDown, Sparkles, Paperclip, X, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore, type Invoice, type Agent } from "@/lib/commission-store";
import {
  calcInvoice,
  calcPayouts,
  fmtMoney,
} from "@/lib/commission-calc";
import {
  buildAllWallets,
  computeCoachInsight,
  type AgentWallet,
  type LedgerEntry,
} from "@/lib/ledger";
import { INDUSTRY_TEMPLATES } from "@/lib/templates";
import {
  buildAgentCommissionPDF,
  buildSaleInvoicePDF,
  buildSaleAndDownload,
} from "@/lib/generate-invoices";
import { useT } from "@/lib/i18n";

/* ---------- Shared SectionCard (duplicated lightweight) ---------- */
function Section({
  title,
  desc,
  children,
  action,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card className="p-6 shadow-card">
      <div className="flex items-start justify-between mb-5 gap-4">
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
  return (
    <div className="text-center py-10 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
      {msg}
    </div>
  );
}

/* ---------- Avatar helpers ---------- */
const AVATAR_COLORS = [
  "#4f46e5","#7c3aed","#db2777","#dc2626","#ea580c",
  "#ca8a04","#16a34a","#0891b2","#0284c7","#9333ea",
];
function nameToColor(name: string) {
  let h = 0;
  for (const c of name) h = h * 31 + c.charCodeAt(0);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function getInitials(name: string) {
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}
function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

/* ========== AI COACH ========== */
function AICoachCard({ agent }: { agent: Agent }) {
  const s = useStore();
  const insight = useMemo(
    () =>
      computeCoachInsight(
        agent,
        s.agents,
        s.invoices,
        s.financeCompanies,
        s.personalTiers,
        s.overrides,
        s.language,
        s.company.currency
      ),
    [agent, s.agents, s.invoices, s.financeCompanies, s.personalTiers, s.overrides, s.language, s.company.currency]
  );
  if (!insight) return null;
  const Icon = insight.kind === "negative" ? TrendingDown : insight.kind === "positive" ? TrendingUp : Sparkles;
  const tone =
    insight.kind === "negative"
      ? { border: "border-l-amber-500", bg: "bg-amber-500/5", chip: "bg-amber-500/10 text-amber-600" }
      : insight.kind === "positive"
        ? { border: "border-l-emerald-500", bg: "bg-emerald-500/5", chip: "bg-emerald-500/10 text-emerald-600" }
        : { border: "border-l-primary", bg: "bg-primary/5", chip: "bg-primary/10 text-primary" };
  return (
    <Card className={cn("p-4 border-l-4", tone.border, tone.bg)}>
      <div className="flex items-start gap-3">
        <div className={cn("shrink-0 rounded-full p-2", tone.chip)}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            <Sparkles className="w-3 h-3" /> AI Coach
          </div>
          <p className="font-medium text-sm">{insight.headline}</p>
          <ul className="mt-1 space-y-0.5">
            {insight.bullets.map((b, i) => (
              <li key={i} className="text-sm text-muted-foreground">{b}</li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

/* ========== WALLET PANEL ========== */
export function WalletPanel() {
  const t = useT();
  const s = useStore();
  const isAdmin = s.role !== "rep";
  const myAgentId = !isAdmin ? s.activeAgentId : null;
  const wallets = useMemo(
    () =>
      buildAllWallets(
        s.agents,
        s.invoices,
        s.financeCompanies,
        s.personalTiers,
        s.overrides,
        s.payments,
        s.disputes,
        s.adjustments
      ),
    [s.agents, s.invoices, s.financeCompanies, s.personalTiers, s.overrides, s.payments, s.disputes, s.adjustments]
  );
  const visibleWallets = isAdmin ? wallets : wallets.filter((w) => w.agent.id === myAgentId);
  const [selected, setSelected] = useState<string>("");

  const current = visibleWallets.find((w) => w.agent.id === selected) || visibleWallets[0];

  if (!visibleWallets.length) {
    return (
      <Section title={isAdmin ? t("wallet_title") : t("wallet_my_title")} desc={t("wallet_desc")}>
        <Empty msg={isAdmin ? t("wallet_empty_admin") : t("wallet_empty_rep")} />
      </Section>
    );
  }

  return (
    <div className="space-y-6">
      {current && <AICoachCard agent={current.agent} />}
      <Section
        title={isAdmin ? t("wallet_title") : t("wallet_my_title")}
        desc={t("wallet_desc")}
        action={
          isAdmin ? (
            <div className="w-full sm:w-64">
              <Select value={current?.agent.id} onValueChange={setSelected}>
                <SelectTrigger>
                  <SelectValue placeholder={t("wallet_pick_rep")} />
                </SelectTrigger>
                <SelectContent>
                  {visibleWallets.map((w) => (
                    <SelectItem key={w.agent.id} value={w.agent.id}>
                      {w.agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null
        }
      >
        {current && <WalletDetail wallet={current} canRecordPayment={isAdmin} />}
      </Section>
    </div>
  );
}

function WalletDetail({ wallet, canRecordPayment = true }: { wallet: AgentWallet; canRecordPayment?: boolean }) {
  const t = useT();
  const s = useStore();
  const cur = s.company.currency;
  const p = wallet.payout;

  const [pay, setPay] = useState({ amount: 0, method: "Bank transfer", reference: "", notes: "" });
  const recordPayment = () => {
    if (!pay.amount || pay.amount <= 0) return toast.error(t("wallet_enter_amount"));
    s.addPayment({
      agentId: wallet.agent.id,
      date: new Date().toISOString().slice(0, 10),
      amount: pay.amount,
      method: pay.method,
      reference: pay.reference,
      notes: pay.notes,
    });
    setPay({ amount: 0, method: "Bank transfer", reference: "", notes: "" });
    toast.success(t("wallet_payment_recorded"));
  };

  const downloadCommissionPDF = () => {
    const doc = buildAgentCommissionPDF(p, s.company, s.invoiceDate, s.periodLabel);
    doc.save(`commission_${wallet.agent.name.replace(/\s+/g, "_")}.pdf`);
  };

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total earned" value={fmtMoney(wallet.totalEarned, cur)} accent />
        <Stat label="Total paid" value={fmtMoney(wallet.totalPaid, cur)} />
        <Stat label="Pending balance" value={fmtMoney(wallet.pendingBalance, cur)} accent />
        <Stat label="Upcoming payout" value={s.nextPayoutDate} />
        <Stat label="Open advances" value={fmtMoney(wallet.openAdvance, cur)} />
        <Stat label="Suggested tax reserve" value={fmtMoney(wallet.taxReserve, cur)} />
        <Stat label="Personal commission" value={fmtMoney(p.personalCommission, cur)} />
        <Stat label="Override total" value={fmtMoney(p.overrideTotal, cur)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Wallet className="w-4 h-4" /> {t("wallet_invoice_hist")}
            </h3>
            <Button size="sm" variant="outline" onClick={downloadCommissionPDF}>
              <FileDown className="w-4 h-4 mr-2" />{t("wallet_commission_pdf")}
            </Button>
          </div>
          {p.invoices.length === 0 ? (
            <Empty msg={t("empty_no_invoices")} />
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="py-1">{t("th_number_col")}</th>
                  <th>{t("th_date")}</th>
                  <th>{t("th_customer")}</th>
                  <th className="text-right">{t("th_profit_col")}</th>
                  <th className="text-right">{t("th_status")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {p.invoices.map((c) => (
                  <tr key={c.invoice.id} className="border-t border-border/60">
                    <td className="py-1 font-mono text-xs">{c.invoice.number}</td>
                    <td className="font-mono text-xs">{c.invoice.date}</td>
                    <td>{c.invoice.customerName || "—"}</td>
                    <td className="text-right font-mono">{fmtMoney(c.profit, cur)}</td>
                    <td className="text-right">
                      <Badge variant={c.invoice.paid ? "default" : "outline"}>
                        {c.invoice.paid ? "paid" : c.invoice.status}
                      </Badge>
                    </td>
                    <td className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => buildSaleAndDownload(c, s.company, wallet.agent.name, wallet.payout)}
                      >
                        PDF
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-3">{t("wallet_override_hist")}</h3>
          {p.downline.length === 0 ? (
            <Empty msg={t("wallet_no_overrides")} />
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="py-1">{t("th_agent")}</th>
                  <th>{t("th_level")}</th>
                  <th className="text-right">Profit</th>
                  <th className="text-right">{t("th_rate")}</th>
                  <th className="text-right">{t("th_override_col")}</th>
                </tr>
              </thead>
              <tbody>
                {p.downline.map((d, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="py-1">{d.agent.name}</td>
                    <td>L{d.level}</td>
                    <td className="text-right font-mono">{fmtMoney(d.profit, cur)}</td>
                    <td className="text-right font-mono">{(d.rate * 100).toFixed(2)}%</td>
                    <td className="text-right font-mono">{fmtMoney(d.override, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">{t("wallet_balance_ledger")}</h3>
        <LedgerTable entries={wallet.ledger} cur={cur} />
        <div className="mt-3 text-sm flex justify-between border-t pt-3">
          <span className="text-muted-foreground">{t("wallet_current_bal")}</span>
          <span className="font-mono font-bold">{fmtMoney(wallet.pendingBalance, cur)}</span>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">{t("wallet_payments_recv")}</h3>
        {canRecordPayment && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 mb-3">
          <div>
            <Label className="text-xs">{t("lbl_amount")}</Label>
            <Input
              type="number"
              step="0.01"
              value={pay.amount}
              onChange={(e) => setPay({ ...pay, amount: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label className="text-xs">{t("lbl_method")}</Label>
            <Input value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">{t("lbl_reference")}</Label>
            <Input
              value={pay.reference}
              onChange={(e) => setPay({ ...pay, reference: e.target.value })}
            />
          </div>
          <div className="md:col-span-1">
            <Label className="text-xs">{t("lbl_notes")}</Label>
            <Input value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} />
          </div>
          <div className="flex items-end">
            <Button onClick={recordPayment} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              {t("wallet_record")}
            </Button>
          </div>
        </div>
        )}
        {wallet.payments.length === 0 ? (
          <Empty msg={t("wallet_no_payments")} />
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground uppercase">
              <tr>
                <th className="py-1">{t("th_date")}</th>
                <th>{t("lbl_method")}</th>
                <th>{t("lbl_reference")}</th>
                <th className="text-right">{t("lbl_amount")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {wallet.payments.map((py) => (
                <tr key={py.id} className="border-t border-border/60">
                  <td className="py-1 font-mono text-xs">{py.date}</td>
                  <td>{py.method}</td>
                  <td className="text-muted-foreground">{py.reference || "—"}</td>
                  <td className="text-right font-mono">{fmtMoney(py.amount, cur)}</td>
                  <td className="text-right">
                    {canRecordPayment && (
                      <Button variant="ghost" size="icon" onClick={() => s.removePayment(py.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono font-semibold mt-1 ${accent ? "text-accent" : ""}`}>{value}</div>
    </div>
  );
}

function LedgerTable({ entries, cur }: { entries: LedgerEntry[]; cur: string }) {
  const t = useT();
  if (entries.length === 0) return <Empty msg={t("wallet_no_ledger")} />;
  return (
    <div className="overflow-x-auto max-h-96">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground uppercase sticky top-0 bg-background">
          <tr>
            <th className="py-1">{t("th_date")}</th>
            <th>{t("th_type")}</th>
            <th>{t("lbl_description")}</th>
            <th className="text-right">{t("th_earned")}</th>
            <th className="text-right">{t("th_out")}</th>
            <th className="text-right">{t("th_balance")}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i} className="border-t border-border/60">
              <td className="py-1 font-mono text-xs">{e.date}</td>
              <td>
                <Badge variant="outline" className="text-[10px] uppercase">
                  {e.type.replace("_", " ")}
                </Badge>
              </td>
              <td className="text-muted-foreground">{e.description}</td>
              <td className="text-right font-mono">
                {e.debit ? fmtMoney(e.debit, cur) : "—"}
              </td>
              <td className="text-right font-mono">
                {e.credit ? fmtMoney(e.credit, cur) : "—"}
              </td>
              <td className="text-right font-mono font-semibold">
                {fmtMoney(e.balance, cur)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ========== EXPLAIN DIALOG ========== */
export function ExplainDialog({
  invoiceId,
  open,
  onClose,
}: {
  invoiceId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const s = useStore();
  const lang = s.language;
  const inv = s.invoices.find((x) => x.id === invoiceId);
  if (!inv) return null;
  const c = calcInvoice(inv, s.financeCompanies);
  const ag = s.agents.find((a) => a.id === inv.agentId) || null;
  const payouts = calcPayouts(s.agents, s.invoices, s.financeCompanies, s.personalTiers, s.overrides);
  const payout = payouts.find((p) => p.agent.id === inv.agentId) || null;
  const isEs = lang === "es";
  const cur = s.company.currency;
  const m = (n: number) => fmtMoney(n, cur);
  const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

  const repName = ag?.name || (isEs ? "Vendedor" : "Salesperson");
  const dealerFeeVal = inv.dealerFee != null ? inv.dealerFee : c.financeCo?.dealerFee ?? 0;
  const ccpfVal = inv.saleType === "credit_card" ? inv.salesAmount * (inv.ccpfPercent ?? 0.035) : 0;
  const adminFeeVal = inv.salesAmount * (inv.adminFeePercent || 0);
  const effectiveRate = payout ? (inv.commissionPercentOverride ?? payout.personalRate) : null;
  const reservePct = inv.taxReservePercent ?? ag?.taxReservePercent ?? 0;
  const reserveAmt = payout ? payout.taxReserveSuggested : 0;
  const finalAmt = payout ? payout.finalPayable : null;

  // Build natural-language bullets
  const bullets: string[] = [];
  if (isEs) {
    bullets.push(`Vendiste ${inv.customerName ? `a ${inv.customerName}` : "esta venta"} por un total de ${m(inv.salesAmount)}.`);
    if (inv.productCost) bullets.push(`El costo del producto fue ${m(inv.productCost)}, que se descontó del profit.`);
    if (c.financeCo && inv.saleType === "finance") {
      bullets.push(`${c.financeCo.name} aprobó el ${pct(inv.approvalPercent)} de la venta — es decir, ${m(c.approvalAmount)} aprobados.`);
      const feeTotal = c.financeCo.defaultFee * inv.salesAmount + c.financeCo.adminFee;
      if (feeTotal > 0) bullets.push(`La financiera cobró comisión más tarifas por un total de ${m(feeTotal)}.`);
    } else if (inv.approvalPercent < 1) {
      bullets.push(`Se aprobó el ${pct(inv.approvalPercent)} de la venta — ${m(c.approvalAmount)}.`);
    }
    if (dealerFeeVal > 0) bullets.push(`Se aplicó una tarifa dealer de ${m(dealerFeeVal)}.`);
    if (adminFeeVal > 0) bullets.push(`Se aplicó una tarifa admin del ${pct(inv.adminFeePercent || 0)}, que equivale a ${m(adminFeeVal)}.`);
    if (ccpfVal > 0) bullets.push(`Se sumó un cargo por pago con tarjeta del ${pct(inv.ccpfPercent ?? 0.035)}, equivalente a ${m(ccpfVal)}.`);
    if (inv.discount) bullets.push(`Se aplicó un descuento de ${m(inv.discount)} sobre la venta.`);
    if (inv.charges.length) inv.charges.forEach((ch) => bullets.push(`Se agregó el cargo "${ch.label || "cargo extra"}" por ${m(ch.amount)}.`));
    if (inv.credits.length) inv.credits.forEach((cr) => bullets.push(`Se sumó un crédito "${cr.label || "crédito"}" de ${m(cr.amount)} a tu favor.`));
    bullets.push(`Después de todos los cargos y deducciones, el profit final fue de ${m(c.profit)}.`);
  } else {
    bullets.push(`You sold ${inv.customerName ? `to ${inv.customerName}` : "this deal"} for ${m(inv.salesAmount)}.`);
    if (inv.productCost) bullets.push(`The product cost was ${m(inv.productCost)}, which was deducted from the profit.`);
    if (c.financeCo && inv.saleType === "finance") {
      bullets.push(`${c.financeCo.name} approved ${pct(inv.approvalPercent)} of the sale — ${m(c.approvalAmount)} approved.`);
      const feeTotal = c.financeCo.defaultFee * inv.salesAmount + c.financeCo.adminFee;
      if (feeTotal > 0) bullets.push(`The lender charged a combined fee of ${m(feeTotal)}.`);
    } else if (inv.approvalPercent < 1) {
      bullets.push(`${pct(inv.approvalPercent)} of the sale was approved — ${m(c.approvalAmount)}.`);
    }
    if (dealerFeeVal > 0) bullets.push(`A dealer fee of ${m(dealerFeeVal)} was applied.`);
    if (adminFeeVal > 0) bullets.push(`An admin fee of ${pct(inv.adminFeePercent || 0)} was applied, totaling ${m(adminFeeVal)}.`);
    if (ccpfVal > 0) bullets.push(`A ${pct(inv.ccpfPercent ?? 0.035)} credit card processing fee was added: ${m(ccpfVal)}.`);
    if (inv.discount) bullets.push(`A discount of ${m(inv.discount)} was applied to the sale.`);
    if (inv.charges.length) inv.charges.forEach((ch) => bullets.push(`The charge "${ch.label || "extra charge"}" was added for ${m(ch.amount)}.`));
    if (inv.credits.length) inv.credits.forEach((cr) => bullets.push(`A credit "${cr.label || "credit"}" of ${m(cr.amount)} was added in your favor.`));
    bullets.push(`After all charges and deductions, the final profit was ${m(c.profit)}.`);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">
            {isEs ? "Resumen de comisión" : "Commission Summary"} · {inv.number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          {/* Greeting */}
          <p className="text-sm font-medium text-foreground/80">
            {isEs
              ? `Hola ${repName}, aquí te explico cómo calculamos tu comisión para esta venta.`
              : `Hi ${repName}, here's a breakdown of how we calculated your commission for this deal.`}
          </p>

          {/* Bullet breakdown */}
          <ul className="space-y-2 text-sm">
            {bullets.map((b, i) => (
              <li key={i} className="flex gap-2 leading-snug">
                <span className="text-accent mt-0.5 shrink-0">•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>

          {/* Commission summary box */}
          {payout && effectiveRate !== null && (
            <div className="rounded-xl bg-accent/5 border border-accent/20 p-4 space-y-2 text-sm">
              <p className="font-medium text-accent">
                {isEs ? "Tu comisión" : "Your commission"}
              </p>
              <p>
                {isEs
                  ? `Tu nivel de compensación es ${inv.commissionLevel || ag?.level || "—"} (${pct(effectiveRate)}), así que tu comisión personal sobre el profit es:`
                  : `Your compensation level is ${inv.commissionLevel || ag?.level || "—"} (${pct(effectiveRate)}), so your personal commission on the profit is:`}
                {" "}<span className="font-bold text-accent text-base">{m(payout.personalCommission)}</span>
              </p>
              {payout.overrideTotal > 0 && (
                <p>
                  {isEs
                    ? `Además, como tienes reps en tu downline, ganaste un override adicional de ${m(payout.overrideTotal)}.`
                    : `You also earned a ${m(payout.overrideTotal)} downline override from your team.`}
                </p>
              )}
              {inv.advanceApplied ? (
                <p>
                  {isEs
                    ? `Se descontó un advance que ya recibiste de ${m(inv.advanceApplied)}.`
                    : `An advance you already received of ${m(inv.advanceApplied)} was deducted.`}
                  {" "}<span className="text-destructive font-semibold">− {m(inv.advanceApplied)}</span>
                </p>
              ) : null}
              {reservePct > 0 && (
                <p>
                  {isEs
                    ? `Recomendamos apartar el ${pct(reservePct)} para impuestos, que serían ${m(reserveAmt)}.`
                    : `We recommend setting aside ${pct(reservePct)} for taxes — that's ${m(reserveAmt)}.`}
                </p>
              )}
              <div className="border-t border-accent/20 pt-3 flex items-center justify-between">
                <p className="font-semibold">
                  {isEs ? "Tu pago estimado:" : "Your estimated payout:"}
                </p>
                <span className="text-xl font-bold text-accent">{m(finalAmt ?? 0)}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {isEs ? "Cerrar" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ========== APPROVAL REQUEST WORKFLOW ========== */

const STATUS_ORDER = [
  "submitted",
  "under_review",
  "needs_info",
  "approved",
  "rejected",
  "resolved",
] as const;

function statusVariant(st: string): "default" | "destructive" | "outline" | "secondary" {
  if (st === "approved" || st === "resolved") return "default";
  if (st === "rejected") return "destructive";
  if (st === "needs_info" || st === "under_review") return "secondary";
  return "outline";
}

function priorityVariant(p: string): "default" | "destructive" | "outline" | "secondary" {
  if (p === "high") return "destructive";
  if (p === "low") return "outline";
  return "secondary";
}

export function DisputeDialog({
  invoiceId,
  open,
  onClose,
}: {
  invoiceId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const s = useStore();
  const isEs = s.language === "es";
  const inv = s.invoices.find((x) => x.id === invoiceId);
  const [kind, setKind] = useState<"correction" | "dispute" | "adjustment">("correction");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [field, setField] = useState<string>("");
  const [toValue, setToValue] = useState("");
  const [attachment, setAttachment] = useState<{ url: string; name: string; isImage: boolean } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!isImage && !isPdf) {
      toast.error("Only images and PDF files are supported.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setAttachment({ url, name: file.name, isImage });
    };
    reader.readAsDataURL(file);
  }, []);

  if (!inv) return null;

  const FIELD_OPTIONS: { value: keyof Invoice | ""; label: string }[] = [
    { value: "", label: "— none —" },
    { value: "salesAmount", label: t("disp_field_sales") },
    { value: "productCost", label: t("disp_field_cost") },
    { value: "approvalPercent", label: t("disp_field_approval") },
    { value: "discount", label: t("lbl_discount") },
    { value: "customerName", label: t("lbl_customer") },
  ];

  void isEs;

  const submit = () => {
    if (!reason.trim()) return toast.error(t("disp_reason_required"));
    const fieldKey = field && field !== "__none" ? field : "";
    const requestedChange =
      fieldKey && toValue.trim()
        ? {
            field: fieldKey,
            fromValue: String((inv as any)[fieldKey] ?? ""),
            toValue: toValue.trim(),
          }
        : null;
    s.addDispute({
      invoiceId: inv.id,
      agentId: inv.agentId,
      reason: reason.trim(),
      notes,
      kind,
      priority,
      requestedChange,
      attachmentUrl: attachment?.url,
    });
    toast.success(t("disp_submitted"));
    setReason("");
    setNotes("");
    setField("");
    setToValue("");
    setKind("correction");
    setPriority("normal");
    setAttachment(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("disp_new_title")} — {inv.number}</DialogTitle>
          <DialogDescription>
            {t("disp_new_desc")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>{t("disp_type")}</Label>
              <Select value={kind} onValueChange={(v: any) => setKind(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="correction">{t("disp_kind_correction")}</SelectItem>
                  <SelectItem value="dispute">{t("disp_kind_dispute")}</SelectItem>
                  <SelectItem value="adjustment">{t("disp_kind_adjustment")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("disp_priority")}</Label>
              <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("disp_prio_low")}</SelectItem>
                  <SelectItem value="normal">{t("disp_prio_normal")}</SelectItem>
                  <SelectItem value="high">{t("disp_prio_high")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>{t("disp_reason")}</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("disp_reason_placeholder")}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>{t("disp_field")}</Label>
              <Select value={field} onValueChange={setField}>
                <SelectTrigger><SelectValue placeholder={t("disp_field_none")} /></SelectTrigger>
                <SelectContent>
                  {FIELD_OPTIONS.map((o) => (
                    <SelectItem key={o.value || "none"} value={o.value || "__none"}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("disp_new_value")}</Label>
              <Input
                value={toValue}
                onChange={(e) => setToValue(e.target.value)}
                disabled={!field || field === "__none"}
                placeholder={
                  field && field !== "__none"
                    ? `Current: ${String((inv as any)[field] ?? "")}`
                    : t("disp_pick_field")
                }
              />
            </div>
          </div>
          <div>
            <Label>{t("disp_notes_lbl")}</Label>
            <Textarea
              value={notes}
              rows={3}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("disp_notes_placeholder")}
            />
          </div>

          {/* File attachment */}
          <div>
            <Label>Attachment <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            {!attachment ? (
              <div
                className={cn(
                  "mt-1 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-sm cursor-pointer transition-colors",
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/40"
                )}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
              >
                <Paperclip className="w-5 h-5 text-muted-foreground" />
                <span className="text-muted-foreground">Click or drag to attach an image or PDF</span>
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                {attachment.isImage ? (
                  <img
                    src={attachment.url}
                    alt={attachment.name}
                    className="h-12 w-12 rounded object-cover border border-border shrink-0"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 shrink-0">
                    <span className="text-xs font-bold text-red-600 dark:text-red-400">PDF</span>
                  </div>
                )}
                <span className="flex-1 min-w-0 text-sm truncate">{attachment.name}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 shrink-0"
                  onClick={() => setAttachment(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("btn_cancel")}</Button>
          <Button onClick={submit}>{t("disp_submit")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestTimeline({ events, agents: _agents }: { events: any[]; agents: { id: string; name: string }[] }) {
  if (!events?.length) return null;
  return (
    <div className="mt-3 border-t pt-3 space-y-1.5">
      {events.map((ev, i) => (
        <div key={i} className="text-xs text-muted-foreground flex gap-2">
          <span className="font-mono shrink-0">{ev.at.slice(0, 16).replace("T", " ")}</span>
          <Badge variant="outline" className="h-5 px-1.5 capitalize">{ev.actor}</Badge>
          <span className="font-medium text-foreground/80">{ev.type.replace("_", " ")}</span>
          {ev.message && <span className="italic">— {ev.message}</span>}
        </div>
      ))}
    </div>
  );
}

function RepRequestsPanel() {
  const t = useT();
  const s = useStore();
  const myAgentId = s.activeAgentId;
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});

  const STATUS_LABEL: Record<string, string> = {
    submitted: t("disp_filter_submitted"),
    under_review: t("disp_filter_review"),
    needs_info: t("disp_filter_needs_info"),
    approved: t("disp_filter_approved"),
    rejected: t("disp_filter_rejected"),
    resolved: t("disp_filter_resolved"),
  };
  const KIND_LABEL: Record<string, string> = {
    correction: t("disp_kind_correction"),
    dispute: t("disp_kind_dispute"),
    adjustment: t("disp_kind_adjustment"),
  };
  const PRIORITY_LABEL: Record<string, string> = {
    low: t("disp_prio_low"),
    normal: t("disp_prio_normal"),
    high: t("disp_prio_high"),
  };

  const visible = s.disputes
    .filter((d) => d.agentId === myAgentId)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (visible.length === 0) {
    return (
      <Section title={t("disp_my_title")} desc={t("disp_my_desc")}>
        <Empty msg={t("disp_my_empty")} />
      </Section>
    );
  }
  return (
    <Section title={t("disp_my_title")} desc={t("disp_my_desc")}>
      <div className="space-y-3">
        {visible.map((d) => {
          const inv = s.invoices.find((x) => x.id === d.invoiceId);
          return (
            <Card key={d.id} className="p-4">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-mono text-xs">{inv?.number || "—"}</span>
                <Badge variant={statusVariant(d.status)}>{STATUS_LABEL[d.status]}</Badge>
                <Badge variant={priorityVariant(d.priority)}>{PRIORITY_LABEL[d.priority]}</Badge>
                <Badge variant="outline">{KIND_LABEL[d.kind]}</Badge>
                <span className="text-xs text-muted-foreground ml-auto">
                  {d.createdAt.slice(0, 10)}
                </span>
              </div>
              <div className="font-medium">{d.reason}</div>
              {d.notes && <p className="text-sm text-muted-foreground mt-1">{d.notes}</p>}
              {d.requestedChange && (
                <p className="text-xs mt-1">
                  <span className="text-muted-foreground">{t("disp_suggested")}</span>{" "}
                  <span className="font-mono">{d.requestedChange.field}</span>{" "}
                  <span className="text-muted-foreground">{d.requestedChange.fromValue}</span>{" "}
                  → <span className="font-medium">{d.requestedChange.toValue}</span>
                </p>
              )}
              {d.adminNotes && (
                <p className="text-xs text-muted-foreground mt-2 italic">
                  {t("disp_admin_notes")} {d.adminNotes}
                </p>
              )}
              {d.status === "needs_info" && (
                <div className="mt-2 flex gap-2">
                  <Input
                    placeholder={t("disp_reply_placeholder")}
                    value={replyDraft[d.id] ?? ""}
                    onChange={(e) =>
                      setReplyDraft((p) => ({ ...p, [d.id]: e.target.value }))
                    }
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      const msg = (replyDraft[d.id] ?? "").trim();
                      if (!msg) return;
                      s.replyToRequest(d.id, "rep", msg);
                      setReplyDraft((p) => ({ ...p, [d.id]: "" }));
                      toast.success(t("disp_reply_sent"));
                    }}
                  >
                    {t("disp_send")}
                  </Button>
                </div>
              )}
              <RequestTimeline events={d.events} agents={s.agents} />
            </Card>
          );
        })}
      </div>
    </Section>
  );
}

function ApprovalsQueuePanel() {
  const t = useT();
  const s = useStore();
  const [filter, setFilter] = useState<string>("active");
  const [search, setSearch] = useState("");
  const [adminMsg, setAdminMsg] = useState<Record<string, string>>({});

  const STATUS_LABEL: Record<string, string> = {
    submitted: t("disp_filter_submitted"),
    under_review: t("disp_filter_review"),
    needs_info: t("disp_filter_needs_info"),
    approved: t("disp_filter_approved"),
    rejected: t("disp_filter_rejected"),
    resolved: t("disp_filter_resolved"),
  };
  const KIND_LABEL: Record<string, string> = {
    correction: t("disp_kind_correction"),
    dispute: t("disp_kind_dispute"),
    adjustment: t("disp_kind_adjustment"),
  };
  const PRIORITY_LABEL: Record<string, string> = {
    low: t("disp_prio_low"),
    normal: t("disp_prio_normal"),
    high: t("disp_prio_high"),
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: s.disputes.length,
      active: 0,
    };
    STATUS_ORDER.forEach((st) => (c[st] = 0));
    for (const d of s.disputes) {
      c[d.status] = (c[d.status] || 0) + 1;
      if (d.status === "submitted" || d.status === "under_review" || d.status === "needs_info") {
        c.active++;
      }
    }
    return c;
  }, [s.disputes]);

  const filtered = useMemo(() => {
    let list = s.disputes.slice();
    if (filter === "active") {
      list = list.filter(
        (d) =>
          d.status === "submitted" ||
          d.status === "under_review" ||
          d.status === "needs_info"
      );
    } else if (filter !== "all") {
      list = list.filter((d) => d.status === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((d) => {
        const inv = s.invoices.find((x) => x.id === d.invoiceId);
        const ag = s.agents.find((a) => a.id === d.agentId);
        return (
          inv?.number?.toLowerCase().includes(q) ||
          ag?.name?.toLowerCase().includes(q) ||
          d.reason.toLowerCase().includes(q)
        );
      });
    }
    return list.sort((a, b) => {
      const pr = { high: 0, normal: 1, low: 2 };
      const dp = pr[a.priority] - pr[b.priority];
      if (dp !== 0) return dp;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [s.disputes, s.invoices, s.agents, filter, search]);

  const chips: { value: string; label: string }[] = [
    { value: "active", label: `${t("disp_filter_active")} (${counts.active})` },
    { value: "submitted", label: `${t("disp_filter_submitted")} (${counts.submitted})` },
    { value: "under_review", label: `${t("disp_filter_review")} (${counts.under_review})` },
    { value: "needs_info", label: `${t("disp_filter_needs_info")} (${counts.needs_info})` },
    { value: "approved", label: `${t("disp_filter_approved")} (${counts.approved})` },
    { value: "rejected", label: `${t("disp_filter_rejected")} (${counts.rejected})` },
    { value: "resolved", label: `${t("disp_filter_resolved")} (${counts.resolved})` },
    { value: "all", label: `${t("disp_filter_all")} (${counts.all})` },
  ];

  return (
    <Section
      title={t("disp_queue_title")}
      desc={t("disp_queue_desc")}
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {chips.map((c) => (
          <Button
            key={c.value}
            size="sm"
            variant={filter === c.value ? "default" : "outline"}
            onClick={() => setFilter(c.value)}
          >
            {c.label}
          </Button>
        ))}
        <div className="w-full sm:w-64 sm:ml-auto mt-2 sm:mt-0">
          <Input
            placeholder={t("disp_search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty msg={t("disp_no_match")} />
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => {
            const inv = s.invoices.find((x) => x.id === d.invoiceId);
            const ag = s.agents.find((a) => a.id === d.agentId);
            const assignee = s.agents.find((a) => a.id === d.assignedAdminId);
            const ageDays = Math.max(
              0,
              Math.floor(
                (Date.now() - new Date(d.createdAt).getTime()) / 86400000
              )
            );
            const isOpen =
              d.status === "submitted" ||
              d.status === "under_review" ||
              d.status === "needs_info";
            const agName = ag?.name || "—";
            return (
              <Card key={d.id} className="p-4">
                {/* Card header: avatar + rep info + badges */}
                <div className="flex items-start gap-3">
                  {/* Avatar initials circle */}
                  <div
                    style={{ background: nameToColor(agName), width: 40, height: 40, flexShrink: 0 }}
                    className="rounded-full flex items-center justify-center text-white font-semibold text-sm select-none"
                    title={agName}
                  >
                    {getInitials(agName)}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Top row: name, invoice #, badges */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className="font-semibold text-sm">{agName}</span>
                      <span className="text-muted-foreground text-xs">·</span>
                      <span className="font-mono text-xs text-muted-foreground">{inv?.number || "—"}</span>

                      {/* Priority badge — explicit colors */}
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        d.priority === "high"
                          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          : d.priority === "low"
                          ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      )}>
                        {PRIORITY_LABEL[d.priority]}
                      </span>

                      {/* Status badge */}
                      <Badge variant={statusVariant(d.status)}>{STATUS_LABEL[d.status]}</Badge>

                      {/* Kind badge */}
                      <Badge variant="outline" className="text-xs">{KIND_LABEL[d.kind]}</Badge>

                      {/* Date + age — pushed to the right */}
                      <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDate(d.createdAt)}
                        {ageDays > 0 && <> · {ageDays}d</>}
                      </span>
                    </div>

                    {/* Assignee */}
                    {assignee && (
                      <p className="text-xs text-muted-foreground mb-1">Assigned to {assignee.name}</p>
                    )}

                    {/* Reason (truncated) */}
                    <p className="font-medium text-sm line-clamp-2">{d.reason}</p>

                    {/* Notes (truncated) */}
                    {d.notes && (
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{d.notes}</p>
                    )}

                    {/* Attachment preview */}
                    {d.attachmentUrl && (
                      <div className="mt-2">
                        {d.attachmentUrl.startsWith("data:image") ? (
                          <img
                            src={d.attachmentUrl}
                            alt="attachment"
                            className="h-16 rounded border border-border object-cover"
                          />
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs">
                            <Paperclip className="w-3 h-3" /> PDF attachment
                          </span>
                        )}
                      </div>
                    )}

                    {/* Requested change */}
                    {d.requestedChange && (
                      <p className="text-xs mt-2 flex items-center gap-1 flex-wrap">
                        <span className="text-muted-foreground">{t("disp_suggested")}</span>
                        <span className="font-mono bg-muted rounded px-1">{d.requestedChange.field}</span>
                        <span className="text-muted-foreground">{d.requestedChange.fromValue}</span>
                        <span>→</span>
                        <span className="font-medium">{d.requestedChange.toValue}</span>
                        {inv && (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto px-1 py-0 text-xs"
                            onClick={() => {
                              const f = d.requestedChange!.field as keyof Invoice;
                              const num = ["salesAmount", "productCost", "approvalPercent", "discount"];
                              const v: any = num.includes(f as string)
                                ? Number(d.requestedChange!.toValue)
                                : d.requestedChange!.toValue;
                              if (num.includes(f as string) && Number.isNaN(v)) {
                                toast.error(t("disp_not_numeric"));
                                return;
                              }
                              s.updateInvoice(inv.id, { [f]: v } as any);
                              toast.success(t("disp_change_applied"));
                            }}
                          >
                            Apply
                          </Button>
                        )}
                      </p>
                    )}

                    {/* Admin notes textarea */}
                    <Textarea
                      className="mt-2"
                      placeholder={t("disp_admin_notes_placeholder")}
                      rows={2}
                      value={d.adminNotes}
                      onChange={(e) => s.updateDispute(d.id, { adminNotes: e.target.value })}
                    />

                    {/* Needs info reply */}
                    {d.status === "needs_info" && (
                      <div className="mt-2 flex gap-2">
                        <Input
                          placeholder={t("disp_msg_placeholder")}
                          value={adminMsg[d.id] ?? ""}
                          onChange={(e) => setAdminMsg((p) => ({ ...p, [d.id]: e.target.value }))}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const msg = (adminMsg[d.id] ?? "").trim();
                            if (!msg) return;
                            s.replyToRequest(d.id, "admin", msg);
                            setAdminMsg((p) => ({ ...p, [d.id]: "" }));
                          }}
                        >
                          {t("disp_send")}
                        </Button>
                      </div>
                    )}

                    <RequestTimeline events={d.events} agents={s.agents} />

                    {/* Inline action buttons */}
                    <div className="flex items-center flex-wrap gap-2 mt-3 pt-3 border-t border-border/50">
                      {d.status === "submitted" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            s.claimRequest(d.id, s.activeAgentId);
                            toast.success(t("disp_claimed"));
                          }}
                        >
                          {t("disp_claim")}
                        </Button>
                      )}
                      {isOpen && d.status !== "needs_info" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            s.setRequestStatus(d.id, "needs_info", "admin", t("disp_needs_info"));
                            toast(t("disp_marked_needs_info"));
                          }}
                        >
                          {t("disp_request_info")}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => {
                          s.setRequestStatus(d.id, "approved", "admin", d.adminNotes || "");
                          toast.success(t("disp_approved_toast"));
                        }}
                        disabled={d.status === "approved"}
                      >
                        {t("um_approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                        onClick={() => {
                          s.setRequestStatus(d.id, "rejected", "admin", d.adminNotes || "");
                          toast(t("disp_rejected_toast"));
                        }}
                        disabled={d.status === "rejected"}
                      >
                        {t("um_reject")}
                      </Button>
                      {(d.status === "approved" || d.status === "rejected") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            s.setRequestStatus(d.id, "resolved", "admin", t("disp_closed"));
                            toast.success(t("disp_resolved"));
                          }}
                        >
                          {t("disp_mark_resolved")}
                        </Button>
                      )}
                      <div className="ml-auto flex items-center gap-1">
                        {inv && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const c = calcInvoice(inv, s.financeCompanies);
                              const doc = buildSaleInvoicePDF(c, s.company, agName);
                              doc.save(`${inv.number}_recalculated.pdf`);
                              toast.success(t("disp_pdf_regen"));
                            }}
                          >
                            <FileDown className="w-4 h-4 mr-1" />
                            PDF
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => s.removeDispute(d.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Section>
  );
}

export function DisputesPanel() {
  const s = useStore();
  return s.role === "admin" ? <ApprovalsQueuePanel /> : <RepRequestsPanel />;
}

/* ========== SIMULATOR ========== */
export function SimulatorPanel() {
  const t = useT();
  const s = useStore();
  const isEs = s.language === "es";
  const cur = s.company.currency;
  const [form, setForm] = useState({
    salesAmount: 10000,
    productCost: 4000,
    financeCompanyId: "none",
    approvalPercent: 1,
    deductions: 0,
    credits: 0,
    level: 0, // 0 = personal commission; >=1 = override at that level
    taxReservePercent: 0.22,
    extraCharges: 0,
  });
  const [saveDialog, setSaveDialog] = useState(false);
  const [saveForm, setSaveForm] = useState({ agentId: "", customerName: "" });

  const fc = s.financeCompanies.find((f) => f.id === form.financeCompanyId) || null;
  const approval = form.salesAmount * form.approvalPercent;
  const financeCharges = fc
    ? fc.dealerFee + fc.adminFee + fc.defaultFee * form.salesAmount
    : 0;
  const totalCharges = financeCharges + form.extraCharges;
  const grand = approval - totalCharges + form.credits;
  const profit = grand - form.productCost - form.deductions;

  let rate = 0;
  let label = isEs ? "Comision personal" : "Personal commission";
  if (form.level === 0) {
    const tiers = [...s.personalTiers].sort((a, b) => a.minVolume - b.minVolume);
    for (const tier of tiers) if (profit >= tier.minVolume) rate = tier.rate;
    label = isEs
      ? `Comision personal (tier @ ${(rate * 100).toFixed(2)}%)`
      : `Personal commission (tier @ ${(rate * 100).toFixed(2)}%)`;
  } else {
    rate = s.overrides.find((o) => o.level === form.level)?.rate ?? 0;
    label = `L${form.level} override @ ${(rate * 100).toFixed(2)}%`;
  }
  const commission = Math.max(0, profit) * rate;
  const taxReserve = Math.max(0, commission) * form.taxReservePercent;
  const net = commission - taxReserve;

  const handleSaveAsInvoice = () => {
    s.addInvoice({
      date: new Date().toISOString().slice(0, 10),
      status: "draft",
      agentId: saveForm.agentId || "",
      financeCompanyId: form.financeCompanyId === "none" ? null : form.financeCompanyId,
      customerName: saveForm.customerName || "—",
      customerNotes: "",
      salesAmount: form.salesAmount,
      productCost: form.productCost,
      approvalPercent: form.approvalPercent,
      discount: 0,
      charges: form.extraCharges > 0 ? [{ label: "Extra charges", amount: form.extraCharges }] : [],
      credits: form.credits > 0 ? [{ label: "Credits", amount: form.credits }] : [],
      advanceApplied: 0,
      specialDeductions: form.deductions,
      taxReservePercent: form.taxReservePercent,
      paid: false,
      saleType: form.financeCompanyId !== "none" ? "finance" : undefined,
    });
    setSaveDialog(false);
    setSaveForm({ agentId: "", customerName: "" });
    toast.success(t("sim_draft_created"));
  };

  return (
    <>
      <Section
        title={t("sim_panel_title")}
        desc={t("sim_panel_desc")}
        action={
          <Button
            size="sm"
            className="bg-gradient-primary text-white hover:opacity-90 gap-1.5"
            onClick={() => setSaveDialog(true)}
          >
            <Plus className="w-4 h-4" /> {t("sim_save_as_invoice")}
          </Button>
        }
      >
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="p-5 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>{t("lbl_sales_amount")}</Label>
                <Input
                  type="number"
                  value={form.salesAmount}
                  onChange={(e) => setForm({ ...form, salesAmount: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>{t("lbl_product_cost")}</Label>
                <Input
                  type="number"
                  value={form.productCost}
                  onChange={(e) => setForm({ ...form, productCost: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>{t("lbl_finance_co")}</Label>
                <Select
                  value={form.financeCompanyId}
                  onValueChange={(v) => setForm({ ...form, financeCompanyId: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {s.financeCompanies.filter((f) => f.active).map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("lbl_approval_pct")}</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={(form.approvalPercent * 100).toFixed(2)}
                  onChange={(e) => setForm({ ...form, approvalPercent: Number(e.target.value) / 100 })}
                />
              </div>
              <div>
                <Label>{t("lbl_commission_level")}</Label>
                <Select
                  value={String(form.level)}
                  onValueChange={(v) => setForm({ ...form, level: Number(v) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t("sim_personal_own")}</SelectItem>
                    {s.overrides.slice().sort((a, b) => a.level - b.level).map((o) => (
                      <SelectItem key={o.level} value={String(o.level)}>
                        L{o.level} downline override
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("sim_extra_charges_lbl")}</Label>
                <Input
                  type="number"
                  value={form.extraCharges}
                  onChange={(e) => setForm({ ...form, extraCharges: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>{t("sim_deductions_lbl")}</Label>
                <Input
                  type="number"
                  value={form.deductions}
                  onChange={(e) => setForm({ ...form, deductions: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>{t("sim_credits_lbl")}</Label>
                <Input
                  type="number"
                  value={form.credits}
                  onChange={(e) => setForm({ ...form, credits: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>{t("lbl_tax_reserve_pct")}</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={(form.taxReservePercent * 100).toFixed(2)}
                  onChange={(e) => setForm({ ...form, taxReservePercent: Number(e.target.value) / 100 })}
                />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" /> Estimate
            </h3>
            <div className="space-y-1 text-sm">
              <Row k={t("sim_approval_amount")} v={fmtMoney(approval, cur)} />
              <Row k={t("sim_finance_fees_lbl")} v={`- ${fmtMoney(totalCharges, cur)}`} />
              <Row k={t("sim_credits_row")} v={`+ ${fmtMoney(form.credits, cur)}`} />
              <Row k={t("sim_grand_total")} v={fmtMoney(grand, cur)} bold />
              <Row k={t("sim_product_cost_lbl")} v={`- ${fmtMoney(form.productCost, cur)}`} />
              <Row k={t("sim_deductions_lbl")} v={`- ${fmtMoney(form.deductions, cur)}`} />
              <Row k={t("sim_profit_base")} v={fmtMoney(profit, cur)} bold />
              <div className="border-t my-2" />
              <Row k={label} v={fmtMoney(commission, cur)} accent bold />
              <Row k={t("sim_tax_res_lbl")} v={`- ${fmtMoney(taxReserve, cur)}`} />
              <Row k={t("sim_take_home")} v={fmtMoney(net, cur)} accent bold />
            </div>
            <p className="text-xs text-muted-foreground mt-4 italic">
              {t("sim_footnote_full")}
            </p>
          </Card>
        </div>
      </Section>

      {/* Save as Invoice dialog */}
      <Dialog open={saveDialog} onOpenChange={(o) => { if (!o) setSaveDialog(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("sim_draft_title")}</DialogTitle>
            <DialogDescription>
              {t("sim_draft_desc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>{t("sim_rep_optional")}</Label>
              <Select value={saveForm.agentId || "none"} onValueChange={(v) => setSaveForm({ ...saveForm, agentId: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="— None —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {s.agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("sim_customer_optional")}</Label>
              <Input
                value={saveForm.customerName}
                onChange={(e) => setSaveForm({ ...saveForm, customerName: e.target.value })}
                placeholder={t("lbl_customer")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialog(false)}>{t("btn_cancel")}</Button>
            <Button onClick={handleSaveAsInvoice} className="bg-gradient-primary text-white hover:opacity-90">
              {t("sim_create_draft")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({
  k,
  v,
  bold,
  accent,
}: {
  k: string;
  v: string;
  bold?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-1 ${bold ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground">{k}</span>
      <span className={`font-mono ${accent ? "text-accent" : ""}`}>{v}</span>
    </div>
  );
}

/* ========== TEMPLATES ========== */
const INDUSTRY_ICONS: Record<string, string> = {
  "water":            "💧",
  "solar":            "☀️",
  "roofing":          "🏠",
  "hvac":             "❄️",
  "alarm":            "🔔",
  "home-improvement": "🔨",
  "real-estate":      "🏡",
  "life-insurance":   "🛡️",
  "dealer":           "🚗",
};

export function TemplatesPanel() {
  const t = useT();
  const s = useStore();
  const isEs = s.language === "es";
  const apply = (id: string) => {
    const tpl = INDUSTRY_TEMPLATES.find((x) => x.id === id);
    if (!tpl) return;
    if (
      !confirm(
        isEs
          ? "Aplicar kit? Esto reemplazara el plan actual."
          : "Apply this kit? This will replace your current plan."
      )
    )
      return;
    s.applyTemplate(tpl);
    toast.success(isEs ? `Kit "${tpl.name}" aplicado` : `${tpl.name} kit applied`);
  };
  return (
    <Section
      title={t("tab_templates")}
      desc="One-click presets for common commission models. Apply a kit to instantly configure tiers, overrides, and finance settings for your industry."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {INDUSTRY_TEMPLATES.map((tpl) => (
          <Card key={tpl.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-xl shrink-0 select-none">
                  {INDUSTRY_ICONS[tpl.id] ?? "🏢"}
                </div>
                <div>
                  <h3 className="font-semibold">{tpl.name}</h3>
                  <p className="text-sm text-muted-foreground">{tpl.description}</p>
                </div>
              </div>
              <Button size="sm" className="shrink-0" onClick={() => apply(tpl.id)}>
                {t("tpl_apply")}
              </Button>
            </div>
            <div className="mt-3 text-xs grid grid-cols-3 gap-2 text-muted-foreground">
              <div>
                <span className="font-semibold text-foreground">{t("tpl_tiers")}</span>
                <ul className="mt-1">
                  {tpl.tiers.map((tt, i) => (
                    <li key={i} className="font-mono">
                      ≥{tt.minVolume} → {(tt.rate * 100).toFixed(1)}%
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <span className="font-semibold text-foreground">{t("tpl_overrides")}</span>
                <ul className="mt-1">
                  {tpl.overrides.map((o) => (
                    <li key={o.level} className="font-mono">
                      L{o.level} → {(o.rate * 100).toFixed(1)}%
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <span className="font-semibold text-foreground">{t("tpl_finance")}</span>
                <div className="mt-1">{tpl.finance ? tpl.finance.name : "—"}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  );
}

/* ========== PAYOUT CALENDAR ========== */
export function CalendarPanel() {
  const t = useT();
  const s = useStore();
  const isEs = s.language === "es";
  void isEs;
  const isAdmin = s.role !== "rep";
  const myAgentId = !isAdmin ? s.activeAgentId : null;
  const cur = s.company.currency;
  const payouts = useMemo(
    () => calcPayouts(s.agents, s.invoices, s.financeCompanies, s.personalTiers, s.overrides),
    [s.agents, s.invoices, s.financeCompanies, s.personalTiers, s.overrides]
  );

  const visibleInvoices = isAdmin
    ? s.invoices
    : s.invoices.filter((i) => i.agentId === myAgentId);
  const visiblePayouts = isAdmin
    ? payouts
    : payouts.filter((p) => p.agent.id === myAgentId);

  // group invoices by their date
  const byDate = new Map<string, Invoice[]>();
  for (const inv of visibleInvoices) {
    if (!byDate.has(inv.date)) byDate.set(inv.date, []);
    byDate.get(inv.date)!.push(inv);
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = visibleInvoices.filter((i) => i.date >= today && !i.paid);
  const past = visibleInvoices.filter((i) => i.date < today || i.paid);

  const totalPending = upcoming.reduce((acc, i) => {
    const c = calcInvoice(i, s.financeCompanies);
    return acc + Math.max(0, c.profit);
  }, 0);
  const totalPaid = past
    .filter((i) => i.paid)
    .reduce((acc, i) => acc + calcInvoice(i, s.financeCompanies).profit, 0);
  const totalPayout = visiblePayouts.reduce((a, p) => a + p.finalPayable, 0);

  return (
    <Section
      title={isAdmin ? t("cal_title") : t("cal_my_title")}
      desc={isAdmin ? t("cal_desc") : t("cal_my_desc")}
      action={
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">{t("cal_next_payout")}</Label>
            <Input
              type="date"
              value={s.nextPayoutDate}
              onChange={(e) => s.setNextPayoutDate(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label={t("cal_stat_next")} value={s.nextPayoutDate} />
        <Stat label={t("cal_stat_pending")} value={fmtMoney(totalPending, cur)} accent />
        <Stat label={t("cal_stat_paid")} value={fmtMoney(totalPaid, cur)} />
        <Stat label={t("cal_stat_period")} value={fmtMoney(totalPayout, cur)} accent />
      </div>

      {byDate.size === 0 ? (
        <Empty msg={t("empty_no_invoices")} />
      ) : (
        <div className="space-y-3">
          {[...byDate.entries()]
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([date, list]) => {
              const dayProfit = list.reduce(
                (acc, i) => acc + calcInvoice(i, s.financeCompanies).profit,
                0
              );
              const paidCount = list.filter((i) => i.paid).length;
              const allPaid = paidCount === list.length;
              const anyPaid = paidCount > 0 && !allPaid;
              return (
                <Card key={date} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="font-mono text-sm">{date}</div>
                      <Badge variant={allPaid ? "default" : anyPaid ? "secondary" : "outline"}>
                        {allPaid ? t("cal_all_paid") : anyPaid ? t("cal_partial") : t("cal_pending")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {list.length} invoice(s)
                      </span>
                    </div>
                    <div className="font-mono font-semibold">{fmtMoney(dayProfit, cur)}</div>
                  </div>
                  <div className="overflow-x-auto"><table className="w-full text-xs">
                    <tbody>
                      {list.map((i) => {
                        const ag = s.agents.find((a) => a.id === i.agentId);
                        const c = calcInvoice(i, s.financeCompanies);
                        return (
                          <tr key={i.id} className="border-t border-border/40">
                            <td className="py-1 font-mono">{i.number}</td>
                            <td>{i.customerName || "—"}</td>
                            <td>{ag?.name || "—"}</td>
                            <td>
                              <Badge variant="outline" className="text-[10px]">
                                {i.paid ? t("status_paid") : t(`status_${i.status}` as any)}
                              </Badge>
                            </td>
                            <td className="text-right font-mono">
                              {fmtMoney(c.profit, cur)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table></div>
                </Card>
              );
            })}
        </div>
      )}
    </Section>
  );
}
