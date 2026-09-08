import { useMemo, useState } from "react";
import { useT } from '@/lib/i18n';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Trash2, Plus, Sparkles, ShieldCheck, History, FileText, Download } from "lucide-react";
import {
  useStore,
  type SplitParticipant,
  type SplitParticipantRole,
  type SplitTemplate,
  type SplitRule,
  type InvoiceSplit,
  type SaleType,
} from "@/lib/commission-store";
import { calcInvoice, fmtMoney } from "@/lib/commission-calc";
import { computeInvolved } from "@/lib/ledger";
import { buildSaleInvoicePDF, makeBrandingSnapshot } from "@/lib/generate-invoices";

const ROLES: SplitParticipantRole[] = [
  "sales_rep",
  "setter",
  "closer",
  "manager",
  "dealer",
  "upline",
  "installer",
  "partner",
  "override_recipient",
  "custom",
];

const SPLIT_COLORS = ["#0B1F3A", "#0284C7", "#10B981", "#EA580C", "#7C3AED", "#DB2777"];

export function roleLabel(r: SplitParticipantRole, custom?: string): string {
  if (r === "custom" && custom) return custom;
  const _ROLE_LABELS: Record<SplitParticipantRole, string> = {
    sales_rep: "Sales Rep",
    setter: "Setter",
    closer: "Closer",
    manager: "Manager",
    dealer: "Dealer",
    upline: "Upline",
    installer: "Installer",
    partner: "Partner",
    override_recipient: "Override Recipient",
    custom: "Custom",
  };
  return _ROLE_LABELS[r];
}

/* ---------- Helpers ---------- */

export function totalSplitPercent(participants: SplitParticipant[]): number {
  return participants.reduce((s, p) => s + (Number(p.splitPercent) || 0), 0);
}

export function isSplitValid(participants: SplitParticipant[]): boolean {
  if (participants.length === 0) return false;
  const total = totalSplitPercent(participants);
  return Math.abs(total - 1) < 0.0001;
}

function pKey(p: SplitParticipant): string {
  return [
    p.agentId ?? "",
    (p.displayName || "").trim().toLowerCase(),
    p.role,
    p.customRoleLabel ?? "",
  ].join("|");
}

export function splitsEqual(
  a: SplitParticipant[] | null | undefined,
  b: SplitParticipant[] | null | undefined
): boolean {
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  const sa = [...aa].sort((x, y) => pKey(x).localeCompare(pKey(y)));
  const sb = [...bb].sort((x, y) => pKey(x).localeCompare(pKey(y)));
  return sa.every(
    (x, i) =>
      pKey(x) === pKey(sb[i]) &&
      Math.abs((x.splitPercent || 0) - (sb[i].splitPercent || 0)) < 0.0001
  );
}

type SplitDiffRow = {
  key: string;
  label: string;
  role: string;
  prevPct: number | null;
  nextPct: number | null;
  change: "added" | "removed" | "changed" | "unchanged";
};

export function diffSplits(
  prev: SplitParticipant[] | null | undefined,
  next: SplitParticipant[] | null | undefined
): SplitDiffRow[] {
  const _ROLE_LABELS: Record<SplitParticipantRole, string> = {
    sales_rep: "Sales Rep",
    setter: "Setter",
    closer: "Closer",
    manager: "Manager",
    dealer: "Dealer",
    upline: "Upline",
    installer: "Installer",
    partner: "Partner",
    override_recipient: "Override Recipient",
    custom: "Custom",
  };
  const map = new Map<string, SplitDiffRow>();
  for (const p of prev ?? []) {
    const k = pKey(p);
    map.set(k, {
      key: k,
      label: p.displayName || "—",
      role: p.role === "custom" ? p.customRoleLabel || "Custom" : _ROLE_LABELS[p.role],
      prevPct: p.splitPercent,
      nextPct: null,
      change: "removed",
    });
  }
  for (const p of next ?? []) {
    const k = pKey(p);
    const existing = map.get(k);
    if (existing) {
      existing.nextPct = p.splitPercent;
      existing.change =
        Math.abs((existing.prevPct ?? 0) - p.splitPercent) < 0.0001
          ? "unchanged"
          : "changed";
    } else {
      map.set(k, {
        key: k,
        label: p.displayName || "—",
        role: p.role === "custom" ? p.customRoleLabel || "Custom" : _ROLE_LABELS[p.role],
        prevPct: null,
        nextPct: p.splitPercent,
        change: "added",
      });
    }
  }
  return [...map.values()];
}

/* ---------- Top-level Splits admin panel ---------- */

export function SplitsPanel() {
  const t = useT();
  const s = useStore();
  const isEs = s.language === 'es';
  void isEs;
  return (
    <div className="space-y-6">
      <SplitTemplatesEditor />
      <SplitRulesEditor />
      <Card className="p-6 shadow-card">
        <div className="flex items-start justify-between mb-4 gap-4">
          <div>
            <h2 className="text-lg font-semibold">{t("spl_invoices_title")}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("spl_invoices_desc")}
            </p>
          </div>
        </div>
        <SplitInvoicesList />
        <p className="text-xs text-muted-foreground mt-4">
          {s.invoices.filter((i) => i.split && i.split.participants.length > 0).length} of{" "}
          {s.invoices.length} invoices have a split.
        </p>
      </Card>
    </div>
  );
}

function SplitInvoicesList() {
  const t = useT();
  const s = useStore();
  const isEs = s.language === 'es';
  void isEs;
  const rows = s.invoices.filter((i) => i.split && i.split.participants.length > 0);
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground border border-dashed rounded-md p-6 text-center">
        No invoices with a split yet.
      </p>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="py-2">{t("th_number_col")}</th>
            <th>{t("th_customer")}</th>
            <th>{t("th_participants")}</th>
            <th>{t("th_total_pct")}</th>
            <th>{t("th_rule")}</th>
            <th>{t("th_status")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((inv) => {
            const split = inv.split!;
            const total = totalSplitPercent(split.participants);
            const valid = isSplitValid(split.participants);
            const rule = s.splitRules.find((r) => r.id === split.appliedRuleId);
            const tpl = s.splitTemplates.find((tp) => tp.id === split.appliedTemplateId);
            return (
              <tr key={inv.id} className="border-t border-border/60">
                <td className="py-2 font-mono text-xs">{inv.number}</td>
                <td>{inv.customerName}</td>
                <td className="text-xs">
                  {split.participants
                    .map((p) => `${p.displayName || "—"} (${roleLabel(p.role, p.customRoleLabel)})`)
                    .join(", ")}
                </td>
                <td className={valid ? "text-emerald-500" : "text-destructive"}>
                  {(total * 100).toFixed(1)}%
                </td>
                <td className="text-xs">
                  {rule ? `Rule: ${rule.name}` : tpl ? `Tpl: ${tpl.name}` : t("spl_manual")}
                </td>
                <td>
                  {split.approvedAt ? (
                    <span className="text-xs text-emerald-500">{t("spl_approved")}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("status_pending")}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Templates editor ---------- */

function SplitTemplatesEditor() {
  const t = useT();
  const s = useStore();
  const isEs = s.language === 'es';
  void isEs;
  const [draftName, setDraftName] = useState("");

  return (
    <Card className="p-6 shadow-card">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t("spl_templates_title")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("spl_templates_desc")}
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder={t("spl_new_tpl_placeholder")}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className="w-56"
          />
          <Button
            size="sm"
            onClick={() => {
              if (!draftName.trim()) return toast.error(t("spl_tpl_name_required"));
              s.addSplitTemplate({
                name: draftName.trim(),
                description: "",
                positions: [
                  { role: "sales_rep", splitPercent: 1 },
                ],
              });
              setDraftName("");
              toast.success(t("spl_tpl_added"));
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            {t("btn_add")}
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {s.splitTemplates.map((tpl) => (
          <TemplateCard key={tpl.id} tpl={tpl} />
        ))}
      </div>
    </Card>
  );
}

function TemplateCard({ tpl }: { tpl: SplitTemplate }) {
  const t = useT();
  const s = useStore();
  const isEs = s.language === 'es';
  const roleLabels: Record<string, string> = {
    "sales_rep": t("um_rep"),
    "setter": isEs ? "Setter" : "Setter",
    "closer": isEs ? "Closer" : "Closer",
    "manager": isEs ? "Manager" : "Manager",
    "dealer": isEs ? "Dealer" : "Dealer",
    "upline": isEs ? "Upline" : "Upline",
    "installer": isEs ? "Instalador" : "Installer",
    "partner": isEs ? "Socio" : "Partner",
    "override_recipient": isEs ? "Receptor de override" : "Override Recipient",
    "custom": t("btn_custom"),
  };
  const total = tpl.positions.reduce((a, p) => a + p.splitPercent, 0);
  const valid = Math.abs(total - 1) < 0.0001 && tpl.positions.length > 0;

  return (
    <div className="border border-border rounded-md p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Input
          value={tpl.name}
          onChange={(e) => s.updateSplitTemplate(tpl.id, { name: e.target.value })}
          className="font-semibold"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => s.removeSplitTemplate(tpl.id)}
          title="Remove template"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <Textarea
        placeholder="Description (optional)"
        value={tpl.description}
        onChange={(e) => s.updateSplitTemplate(tpl.id, { description: e.target.value })}
        rows={2}
      />
      <div className="space-y-2">
        {tpl.positions.map((p, i) => (
          <div key={i} className="grid grid-cols-[1fr_120px_auto] gap-2 items-start">
            <div>
              <Label className="text-xs">{t("spl_role")}</Label>
              <Select
                value={p.role}
                onValueChange={(v: SplitParticipantRole) => {
                  const next = [...tpl.positions];
                  next[i] = { ...next[i], role: v };
                  s.updateSplitTemplate(tpl.id, { positions: next });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {roleLabels[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("spl_percent")}</Label>
              <Input
                type="number"
                step="0.1"
                value={(p.splitPercent * 100).toFixed(2)}
                onChange={(e) => {
                  const next = [...tpl.positions];
                  next[i] = { ...next[i], splitPercent: Number(e.target.value) / 100 };
                  s.updateSplitTemplate(tpl.id, { positions: next });
                }}
              />
              <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-200"
                  style={{
                    width: `${Math.min(100, Math.max(0, p.splitPercent * 100))}%`,
                    backgroundColor: SPLIT_COLORS[i % SPLIT_COLORS.length],
                  }}
                />
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="mt-5"
              onClick={() => {
                const next = tpl.positions.filter((_, j) => j !== i);
                s.updateSplitTemplate(tpl.id, { positions: next });
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
      {/* Total allocation bar */}
      <div className="space-y-1">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{
              width: `${Math.min(100, total * 100)}%`,
              backgroundColor: valid ? "#10B981" : total > 1 ? "#EF4444" : "#F59E0B",
            }}
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            s.updateSplitTemplate(tpl.id, {
              positions: [...tpl.positions, { role: "partner", splitPercent: 0 }],
            })
          }
        >
          <Plus className="w-4 h-4 mr-1" />
          {t("spl_add_position")}
        </Button>
        <span
          className={`text-xs font-mono ${valid ? "text-emerald-500" : total > 1 ? "text-destructive" : "text-amber-500"}`}
        >
          Total {(total * 100).toFixed(1)}%{" "}
          {valid ? "✓" : total > 1 ? "(>100%)" : "(<100%)"}
        </span>
      </div>
    </div>
  );
}

/* ---------- Rules editor ---------- */

function SplitRulesEditor() {
  const t = useT();
  const s = useStore();
  const isEs = s.language === 'es';
  void isEs;
  return (
    <Card className="p-6 shadow-card">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t("spl_rules_title")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("spl_rules_desc")}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() =>
            s.addSplitRule({
              name: t("spl_new_rule_name"),
              priority: 10,
              active: true,
              criteria: {},
              templateId: s.splitTemplates[0]?.id ?? "",
            })
          }
        >
          <Plus className="w-4 h-4 mr-1" />
          {t("spl_add_rule")}
        </Button>
      </div>

      {s.splitRules.length === 0 ? (
        <p className="text-sm text-muted-foreground border border-dashed rounded-md p-6 text-center">
          {t("spl_no_rules")}
        </p>
      ) : (
        <div className="space-y-3">
          {[...s.splitRules]
            .sort((a, b) => b.priority - a.priority)
            .map((rule) => (
              <RuleRow key={rule.id} rule={rule} />
            ))}
        </div>
      )}
    </Card>
  );
}

function RuleRow({ rule }: { rule: SplitRule }) {
  const t = useT();
  const s = useStore();
  const isEs = s.language === 'es';
  void isEs;
  const c = rule.criteria;
  const update = (patch: Partial<SplitRule>) => s.updateSplitRule(rule.id, patch);
  const updateCriteria = (patch: Partial<SplitRule["criteria"]>) =>
    update({ criteria: { ...c, ...patch } });

  return (
    <div className="border border-border rounded-md p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs">{t("spl_rule_name")}</Label>
          <Input value={rule.name} onChange={(e) => update({ name: e.target.value })} />
        </div>
        <div className="w-24">
          <Label className="text-xs">{t("spl_priority")}</Label>
          <Input
            type="number"
            value={rule.priority}
            onChange={(e) => update({ priority: Number(e.target.value) })}
          />
        </div>
        <div className="w-56">
          <Label className="text-xs">{t("spl_template_lbl")}</Label>
          <Select value={rule.templateId} onValueChange={(v) => update({ templateId: v })}>
            <SelectTrigger>
              <SelectValue placeholder={t("spl_tpl_placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {s.splitTemplates.map((tp) => (
                <SelectItem key={tp.id} value={tp.id}>
                  {tp.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={rule.active} onCheckedChange={(v) => update({ active: v })} />
          <span className="text-xs">{t("spl_active_lbl")}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => s.removeSplitRule(rule.id)}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">{t("lbl_finance_co")}</Label>
          <Select
            value={c.financeCompanyId ?? "any"}
            onValueChange={(v) => updateCriteria({ financeCompanyId: v === "any" ? undefined : v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t("spl_any")}</SelectItem>
              {s.financeCompanies.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{t("spl_rep_level")}</Label>
          <Input
            placeholder="e.g. Junior Rep"
            value={c.repLevel ?? ""}
            onChange={(e) =>
              updateCriteria({ repLevel: e.target.value || undefined })
            }
          />
        </div>
        <div>
          <Label className="text-xs">{t("spl_comm_level_lbl")}</Label>
          <Input
            placeholder="e.g. Manager"
            value={c.commissionLevel ?? ""}
            onChange={(e) =>
              updateCriteria({ commissionLevel: e.target.value || undefined })
            }
          />
        </div>
        <div>
          <Label className="text-xs">{t("spl_manager_upline")}</Label>
          <Select
            value={c.managerAgentId ?? "any"}
            onValueChange={(v) =>
              updateCriteria({ managerAgentId: v === "any" ? undefined : v })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t("spl_any")}</SelectItem>
              {s.agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{t("spl_deal_type")}</Label>
          <Select
            value={c.dealType ?? "any"}
            onValueChange={(v) =>
              updateCriteria({ dealType: v === "any" ? undefined : (v as SaleType) })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t("spl_any")}</SelectItem>
              <SelectItem value="credit_card">{t("sale_credit_card")}</SelectItem>
              <SelectItem value="finance">{t("sale_finance")}</SelectItem>
              <SelectItem value="check">{t("sale_check")}</SelectItem>
              <SelectItem value="wire">{t("sale_wire")}</SelectItem>
              <SelectItem value="cash">{t("sale_cash")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

/* ---------- Per-invoice editor dialog ---------- */

export function SplitEditorDialog({
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
  const isEs = s.language === 'es';
  const inv = invoiceId ? s.invoices.find((i) => i.id === invoiceId) ?? null : null;

  const initial = useMemo<SplitParticipant[]>(() => {
    if (!inv) return [];
    if (inv.split && inv.split.participants.length > 0) return inv.split.participants;
    const ag = s.agents.find((a) => a.id === inv.agentId);
    return [
      {
        id: cryptoId(),
        agentId: inv.agentId,
        displayName: ag?.name ?? "Primary rep",
        role: "sales_rep",
        splitPercent: 1,
        commissionLevel: ag?.level,
      },
    ];
  }, [inv, s.agents]);

  const [participants, setParticipants] = useState<SplitParticipant[]>(initial);
  const [regenPrompt, setRegenPrompt] = useState(false);

  // Reset when opening a different invoice
  const [lastInvoice, setLastInvoice] = useState<string | null>(null);
  if (invoiceId !== lastInvoice) {
    setLastInvoice(invoiceId);
    setParticipants(initial);
  }

  if (!inv) return null;

  const roleLabels: Record<string, string> = {
    "sales_rep": t("um_rep"),
    "setter": isEs ? "Setter" : "Setter",
    "closer": isEs ? "Closer" : "Closer",
    "manager": isEs ? "Manager" : "Manager",
    "dealer": isEs ? "Dealer" : "Dealer",
    "upline": isEs ? "Upline" : "Upline",
    "installer": isEs ? "Instalador" : "Installer",
    "partner": isEs ? "Socio" : "Partner",
    "override_recipient": isEs ? "Receptor de override" : "Override Recipient",
    "custom": t("btn_custom"),
  };

  const calc = calcInvoice(inv, s.financeCompanies);
  const personalRate =
    inv.commissionPercentOverride ??
    s.agents.find((a) => a.id === inv.agentId)?.commissionPercent ??
    0;
  const pool = Math.max(0, Math.max(0, calc.commissionableBase) * personalRate - calc.adminFeeAmount);
  const total = totalSplitPercent(participants);
  const valid = isSplitValid(participants);
  const split = inv.split ?? null;

  const updateP = (idx: number, patch: Partial<SplitParticipant>) => {
    setParticipants((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const wasApproved = !!split?.approvedAt;
  const previousParticipants = split?.participants ?? null;
  const splitChanged = !splitsEqual(previousParticipants, participants);

  const currentUser = s.role === "rep"
    ? s.agents.find((a) => a.id === s.activeAgentId)?.name ?? "Rep"
    : s.currentUserName || "Admin";

  const regeneratePdf = (reason: "split_changed" | "manual_regeneration" | "approval") => {
    const fresh = useStore.getState().invoices.find((i) => i.id === inv.id);
    if (!fresh) return;
    const freshCalc = calcInvoice(fresh, s.financeCompanies);
    const ag = s.agents.find((a) => a.id === fresh.agentId);
    const rows = computeInvolved(fresh, freshCalc, s.agents, s.overrides, s.language);
    const doc = buildSaleInvoicePDF(freshCalc, s.company, ag?.name ?? "—", null, rows);
    const fileName = `${fresh.number}_${(fresh.customerName || "invoice").replace(/\s+/g, "_")}_v${(fresh.pdfHistory?.length ?? 0) + 1}.pdf`;
    doc.save(fileName);
    s.appendInvoicePdfRecord(fresh.id, {
      at: new Date().toISOString(),
      by: currentUser,
      reason,
      fileName,
      splitSnapshot: fresh.split?.participants ?? null,
      brandingSnapshot: makeBrandingSnapshot(s.company),
    });
    toast.success(t("spl_regen_done"));
  };

  const downloadHistoricalPdf = (record: typeof inv.pdfHistory extends (infer T)[] | undefined ? T : never) => {
    // Reconstruct an invoice variant with the historical split + branding snapshots
    const historicalInvoice = {
      ...inv,
      brandingSnapshot: record.brandingSnapshot,
      split: record.splitSnapshot
        ? {
            participants: record.splitSnapshot,
            appliedRuleId: null,
            appliedTemplateId: null,
            approvedAt: record.at,
            approvedBy: record.by,
            history: [],
          }
        : null,
    };
    const c = calcInvoice(historicalInvoice, s.financeCompanies);
    const ag = s.agents.find((a) => a.id === inv.agentId);
    const rows = computeInvolved(historicalInvoice, c, s.agents, s.overrides, s.language);
    const doc = buildSaleInvoicePDF(c, s.company, ag?.name ?? "—", null, rows);
    doc.save(record.fileName);
    toast.success(`Downloaded ${record.fileName}`);
  };

  const save = (approve: boolean) => {
    if (!valid) {
      isEs
        ? toast.error("Los splits deben sumar 100%")
        : toast.error("Splits must total 100%");
      return;
    }
    const next: InvoiceSplit = {
      participants,
      appliedRuleId: split?.appliedRuleId ?? null,
      appliedTemplateId: split?.appliedTemplateId ?? null,
      approvedAt: approve ? new Date().toISOString() : split?.approvedAt ?? null,
      approvedBy: approve ? currentUser : split?.approvedBy ?? null,
      history: split?.history ?? [],
    };
    s.setInvoiceSplit(inv.id, next, {
      by: currentUser,
      action: approve ? "approved" : split ? "updated" : "created",
      message: approve
        ? "Approved split."
        : split
          ? "Updated participants."
          : "Created split.",
    });

    // Only prompt to regenerate when the approved split actually changed.
    if (wasApproved && !approve && splitChanged) {
      setRegenPrompt(true);
      return;
    }
    toast.success(
      approve
        ? "Split approved. PDF will regenerate next time."
        : t("spl_saved")
    );
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("spl_dialog_split")} {inv.number}</DialogTitle>
          <DialogDescription>
            {t("spl_dialog_desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-3 gap-3 text-sm">
          <Stat label={t("spl_comm_base")} value={fmtMoney(calc.commissionableBase, s.company.currency)} />
          <Stat label={t("spl_personal_rate")} value={`${(personalRate * 100).toFixed(2)}%`} />
          <Stat label={t("spl_pool")} value={fmtMoney(pool, s.company.currency)} accent />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("spl_quick_apply")}</span>
          {s.splitTemplates.map((tpl) => (
            <Button
              key={tpl.id}
              variant="outline"
              size="sm"
              onClick={() => {
                const ag = s.agents.find((a) => a.id === inv.agentId);
                setParticipants(
                  tpl.positions.map((pos, i) => ({
                    id: cryptoId(),
                    agentId: i === 0 ? inv.agentId : null,
                    displayName: i === 0 ? ag?.name ?? "Primary rep" : "",
                    role: pos.role,
                    customRoleLabel: pos.customRoleLabel,
                    splitPercent: pos.splitPercent,
                    commissionLevel: i === 0 ? ag?.level : undefined,
                  }))
                );
              }}
            >
              {tpl.name}
            </Button>
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const id = s.applySplitRules(inv.id, "admin");
              if (id) {
                const updated = useStore.getState().invoices.find((x) => x.id === inv.id);
                setParticipants(updated?.split?.participants ?? participants);
                toast.success(t("spl_match_applied"));
              } else {
                toast.info(t("spl_no_match"));
              }
            }}
          >
            <Sparkles className="w-4 h-4 mr-1" />
            Apply rules
          </Button>
        </div>

        {/* Visual stacked bar */}
        {participants.length > 0 && (
          <div className="space-y-2">
            <div className="flex h-4 rounded-full overflow-hidden gap-px">
              {participants.map((p, i) => (
                <div
                  key={p.id}
                  className="transition-all duration-200"
                  style={{
                    width: `${Math.max(0, (p.splitPercent || 0) * 100)}%`,
                    backgroundColor: SPLIT_COLORS[i % SPLIT_COLORS.length],
                  }}
                  title={`${p.displayName || "Participant"}: ${((p.splitPercent || 0) * 100).toFixed(1)}%`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {participants.map((p, i) => (
                <span key={p.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: SPLIT_COLORS[i % SPLIT_COLORS.length] }}
                  />
                  {p.displayName || `P${i + 1}`}
                  <span className="font-mono font-semibold text-foreground">
                    {((p.splitPercent || 0) * 100).toFixed(1)}%
                  </span>
                  <span className="font-mono text-accent">
                    {fmtMoney(pool * (p.splitPercent || 0), s.company.currency)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2 max-h-[40vh] overflow-y-auto">
          {participants.map((p, i) => (
            <div
              key={p.id}
              className="grid grid-cols-12 gap-2 items-end border border-border rounded-md p-3"
            >
              <div className="col-span-3">
                <Label className="text-xs">{t("spl_user")}</Label>
                <Select
                  value={p.agentId ?? "external"}
                  onValueChange={(v) => {
                    if (v === "external") {
                      updateP(i, { agentId: null });
                    } else {
                      const ag = s.agents.find((a) => a.id === v);
                      updateP(i, {
                        agentId: v,
                        displayName: ag?.name ?? p.displayName,
                        commissionLevel: ag?.level,
                      });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="external">{t("spl_external")}</SelectItem>
                    {s.agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3">
                <Label className="text-xs">{t("spl_display_name")}</Label>
                <Input
                  value={p.displayName}
                  onChange={(e) => updateP(i, { displayName: e.target.value })}
                  placeholder={t("spl_req_external")}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">{t("spl_role")}</Label>
                <Select
                  value={p.role}
                  onValueChange={(v: SplitParticipantRole) => updateP(i, { role: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {roleLabels[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {p.role === "custom" && (
                  <Input
                    className="mt-1"
                    placeholder={t("spl_custom_role")}
                    value={p.customRoleLabel ?? ""}
                    onChange={(e) =>
                      updateP(i, { customRoleLabel: e.target.value })
                    }
                  />
                )}
              </div>
              <div className="col-span-2">
                <Label className="text-xs">{t("spl_split_pct")}</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={(p.splitPercent * 100).toFixed(2)}
                  onChange={(e) =>
                    updateP(i, { splitPercent: Number(e.target.value) / 100 })
                  }
                />
                <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{
                      width: `${Math.min(100, Math.max(0, (p.splitPercent || 0) * 100))}%`,
                      backgroundColor: SPLIT_COLORS[i % SPLIT_COLORS.length],
                    }}
                  />
                </div>
              </div>
              <div className="col-span-1 text-right text-xs font-mono">
                {fmtMoney(pool * p.splitPercent, s.company.currency)}
              </div>
              <div className="col-span-1 flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setParticipants((prev) => prev.filter((_, j) => j !== i))
                  }
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between text-sm">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setParticipants((prev) => [
                ...prev,
                {
                  id: cryptoId(),
                  agentId: null,
                  displayName: "",
                  role: "partner",
                  splitPercent: 0,
                },
              ])
            }
          >
            <Plus className="w-4 h-4 mr-1" />
            {t("spl_add_participant")}
          </Button>
          <div className="flex flex-col items-end gap-1 min-w-[160px]">
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{
                  width: `${Math.min(100, total * 100)}%`,
                  backgroundColor: valid ? "#10B981" : total > 1 ? "#EF4444" : "#F59E0B",
                }}
              />
            </div>
            <div
              className={`text-xs font-mono ${valid ? "text-emerald-500" : total > 1 ? "text-destructive" : "text-amber-500"}`}
            >
              Total {(total * 100).toFixed(2)}%{" "}
              {valid ? "✓" : total > 1 ? "(>100%)" : t("spl_must_100")}
            </div>
          </div>
        </div>

        {split?.history && split.history.length > 0 && (
          <div className="border-t pt-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-1">
              <History className="w-3.5 h-3.5" /> Audit log
            </div>
            <ul className="text-xs space-y-1 max-h-32 overflow-y-auto">
              {split.history
                .slice()
                .reverse()
                .map((h, i) => (
                  <li key={i}>
                    <span className="font-mono text-muted-foreground">
                      {h.at.slice(0, 16).replace("T", " ")}
                    </span>{" "}
                    · <span className="font-semibold">{h.action}</span> by {h.by} —{" "}
                    {h.message}
                  </li>
                ))}
            </ul>
          </div>
        )}

        {inv.pdfHistory && inv.pdfHistory.length > 0 && (
          <div className="border-t pt-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-1">
              <FileText className="w-3.5 h-3.5" /> PDF history ({inv.pdfHistory.length})
            </div>
            <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
              {inv.pdfHistory
                .slice()
                .reverse()
                .map((r, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground">
                      {r.at.slice(0, 16).replace("T", " ")}
                    </span>
                    <span>·</span>
                    <span className="font-semibold">{r.reason.replace(/_/g, " ")}</span>
                    <span>by {r.by}</span>
                    <span className="truncate flex-1">— {r.fileName}</span>
                    {r.splitSnapshot && r.splitSnapshot.length > 0 && (
                      <span className="text-muted-foreground">
                        ({r.splitSnapshot.length}p)
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2"
                      onClick={() => downloadHistoricalPdf(r)}
                      title="Download this version"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  </li>
                ))}
            </ul>
          </div>
        )}

        <DialogFooter className="gap-2 flex-wrap">
          {split && (
            <Button
              variant="outline"
              onClick={() => {
                s.setInvoiceSplit(inv.id, null, {
                  by: currentUser,
                  action: "cleared",
                  message: "Split cleared.",
                });
                toast.success("Split removed.");
                onClose();
              }}
            >
              {t("spl_clear")}
            </Button>
          )}
          {wasApproved && (
            <Button
              variant="outline"
              onClick={() => regeneratePdf("manual_regeneration")}
            >
              <FileText className="w-4 h-4 mr-1" />
              {t("spl_regen_pdf")}
            </Button>
          )}
          <Button variant="secondary" onClick={() => save(false)} disabled={!valid}>
            {t("btn_save")}
          </Button>
          <Button onClick={() => save(true)} disabled={!valid}>
            <ShieldCheck className="w-4 h-4 mr-1" />
            {t("spl_save_approve")}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={regenPrompt} onOpenChange={setRegenPrompt}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("spl_regen_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("spl_regen_desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="border rounded-md overflow-hidden text-xs">
            <div className="grid grid-cols-12 bg-muted/50 px-2 py-1 font-semibold">
              <div className="col-span-4">{t("spl_col_participant")}</div>
              <div className="col-span-2">{t("spl_role")}</div>
              <div className="col-span-2 text-right">{t("spl_col_prev")}</div>
              <div className="col-span-2 text-right">{t("spl_col_new")}</div>
              <div className="col-span-2 text-right">{t("spl_col_change")}</div>
            </div>
            <div className="max-h-56 overflow-y-auto divide-y">
              {diffSplits(previousParticipants, participants).map((row) => (
                <div
                  key={row.key}
                  className={`grid grid-cols-12 px-2 py-1 ${
                    row.change === "added"
                      ? "bg-emerald-500/10"
                      : row.change === "removed"
                        ? "bg-destructive/10"
                        : row.change === "changed"
                          ? "bg-amber-500/10"
                          : ""
                  }`}
                >
                  <div className="col-span-4 truncate">{row.label}</div>
                  <div className="col-span-2 truncate">{row.role}</div>
                  <div className="col-span-2 text-right font-mono">
                    {row.prevPct === null ? "—" : `${(row.prevPct * 100).toFixed(2)}%`}
                  </div>
                  <div className="col-span-2 text-right font-mono">
                    {row.nextPct === null ? "—" : `${(row.nextPct * 100).toFixed(2)}%`}
                  </div>
                  <div className="col-span-2 text-right uppercase tracking-wider text-[10px]">
                    {row.change}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setRegenPrompt(false);
                toast.info(t("spl_not_saved_pdf"));
                onClose();
              }}
            >
              {t("spl_skip")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                regeneratePdf("split_changed");
                setRegenPrompt(false);
                onClose();
              }}
            >
              {t("spl_regen_now")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="border border-border rounded-md p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`font-mono font-semibold ${accent ? "text-accent" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function cryptoId(): string {
  return Math.random().toString(36).slice(2, 10);
}
