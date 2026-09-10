import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Split as SplitIcon, MessageSquare, Activity, Download, ArrowDownNarrowWide, ArrowUpNarrowWide, Receipt, Users } from "lucide-react";
import { useStore } from "@/lib/commission-store";
import { calcInvoice, fmtMoney } from "@/lib/commission-calc";
import { computeInvolved } from "@/lib/ledger";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";

type SourceFilter = "all" | "split" | "pdf" | "dispute" | "invoice";
type SortOrder = "newest" | "oldest";
const FILTERS_KEY = "invoiceTimeline.filters";
const NOTIF_SORT_KEY = "notifications.sortOrder";

type PersistedFilters = Record<string, { source: SourceFilter; dispute: string; sort: SortOrder }>;

function readFilters(): PersistedFilters {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(FILTERS_KEY) || "{}") as PersistedFilters;
  } catch {
    return {};
  }
}
function writeFilters(f: PersistedFilters) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(FILTERS_KEY, JSON.stringify(f));
  }
}
function readNotifSort(): SortOrder {
  if (typeof window === "undefined") return "newest";
  try {
    const v = window.localStorage.getItem(NOTIF_SORT_KEY);
    return v === "oldest" ? "oldest" : "newest";
  } catch {
    return "newest";
  }
}

type TimelineEntry = {
  at: string;
  source: "split" | "pdf" | "dispute" | "invoice";
  by: string;
  action: string;
  message: string;
  meta?: string;
};

function csvCell(v: string): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function InvoiceTimelineDialog({
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
  const inv = invoiceId ? s.invoices.find((i) => i.id === invoiceId) ?? null : null;
  const initial = useMemo(
    () => (invoiceId ? readFilters()[invoiceId] : undefined),
    [invoiceId]
  );
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(initial?.source ?? "all");
  const [disputeFilter, setDisputeFilter] = useState<string>(initial?.dispute ?? "all");
  const [sortOrder, setSortOrder] = useState<SortOrder>(initial?.sort ?? readNotifSort());

  // Re-sync state when switching invoices
  useEffect(() => {
    if (!invoiceId) return;
    const f = readFilters()[invoiceId];
    setSourceFilter(f?.source ?? "all");
    setDisputeFilter(f?.dispute ?? "all");
    setSortOrder(f?.sort ?? readNotifSort());
  }, [invoiceId]);

  // Persist per invoice
  useEffect(() => {
    if (!invoiceId) return;
    const all = readFilters();
    all[invoiceId] = { source: sourceFilter, dispute: disputeFilter, sort: sortOrder };
    writeFilters(all);
  }, [invoiceId, sourceFilter, disputeFilter, sortOrder]);

  const invoiceDisputes = useMemo(
    () => (inv ? s.disputes.filter((d) => d.invoiceId === inv.id) : []),
    [inv, s.disputes]
  );

  const involved = useMemo(() => {
    if (!inv) return [];
    const c = calcInvoice(inv, s.financeCompanies);
    return computeInvolved(inv, c, s.agents, s.overrides, s.language, s.company.commissionEntryMode);
  }, [inv, s.financeCompanies, s.agents, s.overrides, s.language, s.company.commissionEntryMode]);

  const allEntries = useMemo<TimelineEntry[]>(() => {
    if (!inv) return [];
    const out: TimelineEntry[] = [];
    // Invoice creation event
    const agentName = s.agents.find((a) => a.id === inv.agentId)?.name ?? "—";
    out.push({
      at: `${inv.date}T00:00:00.000Z`,
      source: "invoice",
      by: agentName,
      action: isEs ? "Invoice creada" : "Invoice created",
      message: `${inv.customerName || (isEs ? "cliente" : "customer")} · ${inv.number}`,
    });
    // Status changes
    if (inv.status === "paid") {
      out.push({
        at: inv.date + "T23:59:00.000Z",
        source: "invoice",
        by: "admin",
        action: isEs ? "Marcada como pagada" : "Marked as paid",
        message: inv.number,
      });
    }
    for (const h of inv.split?.history ?? []) {
      out.push({
        at: h.at, source: "split", by: h.by,
        action: `Split ${h.action}`, message: h.message,
      });
    }
    for (const r of inv.pdfHistory ?? []) {
      out.push({
        at: r.at, source: "pdf", by: r.by,
        action: `PDF ${r.reason.replace(/_/g, " ")}`,
        message: r.fileName,
        meta: r.splitSnapshot ? `${r.splitSnapshot.length} participants` : undefined,
      });
    }
    for (const d of invoiceDisputes) {
      for (const ev of d.events ?? []) {
        out.push({
          at: ev.at, source: "dispute", by: ev.actor,
          action: `Request ${ev.type.replace(/_/g, " ")}`,
          message: ev.message || d.reason,
          meta: `${d.kind}#${d.id.slice(0, 6)}`,
        });
      }
    }
    return out;
  }, [inv, invoiceDisputes]);

  const entries = useMemo(() => {
    const filtered = allEntries.filter((e) => {
      if (sourceFilter !== "all" && e.source !== sourceFilter) return false;
      if (e.source === "dispute" && disputeFilter !== "all") {
        return e.meta?.endsWith(`#${disputeFilter.slice(0, 6)}`);
      }
      if (e.source !== "dispute" && disputeFilter !== "all") return false;
      return true;
    });
    return filtered.sort((a, b) =>
      sortOrder === "newest" ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at)
    );
  }, [allEntries, sourceFilter, disputeFilter, sortOrder]);

  const filterSuffix = useMemo(() => {
    const parts: string[] = [];
    if (sourceFilter !== "all") parts.push(sourceFilter);
    if (disputeFilter !== "all") parts.push(`d${disputeFilter.slice(0, 6)}`);
    return parts.length ? `-${parts.join("-")}` : "";
  }, [sourceFilter, disputeFilter]);

  const exportCsv = () => {
    if (!inv) return;
    const header = ["Timestamp", "Source", "Action", "By", "Message", "Meta"];
    const rows = entries.map((e) => [e.at, e.source, e.action, e.by, e.message, e.meta ?? ""]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timeline-${inv.number}${filterSuffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("tl_export_csv"));
  };

  const exportPdf = () => {
    if (!inv) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    doc.setFontSize(16);
    doc.text(`Invoice Timeline · ${inv.number}`, 40, 50);
    doc.setFontSize(10);
    doc.setTextColor(100);
    const filterDesc =
      `Filters: source=${sourceFilter}, sort=${sortOrder}` +
      (disputeFilter !== "all" ? `, dispute=${disputeFilter.slice(0, 8)}` : "");
    doc.text(
      `Customer: ${inv.customerName}    Generated: ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
      40, 68
    );
    doc.text(filterDesc, 40, 82);
    autoTable(doc, {
      startY: 100,
      head: [["Timestamp", "Source", "Action", "By", "Message"]],
      body: entries.map((e) => [
        e.at.slice(0, 16).replace("T", " "),
        e.source, e.action, e.by,
        [e.message, e.meta ? `(${e.meta})` : ""].filter(Boolean).join(" "),
      ]),
      styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fillColor: [35, 45, 90] },
      columnStyles: {
        0: { cellWidth: 90 }, 1: { cellWidth: 50 },
        2: { cellWidth: 110 }, 3: { cellWidth: 70 },
        4: { cellWidth: "auto" },
      },
    });
    doc.save(`timeline-${inv.number}${filterSuffix}.pdf`);
    toast.success(t("tl_export_pdf"));
  };

  if (!inv) return null;

  const SOURCES: { key: SourceFilter; label: string }[] = [
    { key: "all", label: t("tl_filter_all") },
    { key: "invoice", label: isEs ? "Invoice" : "Invoice" },
    { key: "split", label: t("tl_filter_splits") },
    { key: "pdf", label: t("tl_filter_pdfs") },
    { key: "dispute", label: t("tl_filter_disputes") },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            {t("tl_title")} {inv.number}
          </DialogTitle>
          <DialogDescription>
            {t("tl_desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            {SOURCES.map((opt) => (
              <Button
                key={opt.key}
                size="sm"
                variant={sourceFilter === opt.key ? "default" : "outline"}
                className="h-6 px-2 text-[11px]"
                onClick={() => setSourceFilter(opt.key)}
              >
                {opt.label}
              </Button>
            ))}
            {invoiceDisputes.length > 1 && (
              <select
                value={disputeFilter}
                onChange={(e) => setDisputeFilter(e.target.value)}
                className="h-6 text-[11px] border border-input rounded-md bg-background px-2"
              >
                <option value="all">{t("tl_all_disputes")}</option>
                {invoiceDisputes.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.kind} · {d.reason.slice(0, 24)}
                  </option>
                ))}
              </select>
            )}
            <span className="text-[11px] text-muted-foreground ml-1">
              {entries.length}/{allEntries.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setSortOrder((o) => (o === "newest" ? "oldest" : "newest"))}
              title={sortOrder === "newest" ? t("notif_newest") : t("notif_oldest")}
            >
              {sortOrder === "newest" ? (
                <ArrowDownNarrowWide className="w-3 h-3 mr-1" />
              ) : (
                <ArrowUpNarrowWide className="w-3 h-3 mr-1" />
              )}
              {sortOrder === "newest" ? t("tl_newest") : t("tl_oldest")}
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={entries.length === 0}>
              <Download className="w-3.5 h-3.5 mr-1" />
              CSV
            </Button>
            <Button size="sm" variant="outline" onClick={exportPdf} disabled={entries.length === 0}>
              <Download className="w-3.5 h-3.5 mr-1" />
              PDF
            </Button>
          </div>
        </div>

        {involved.length > 0 && (
          <div className="border border-border rounded-md p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              <Users className="w-3.5 h-3.5" />
              {isEs ? "Reparto de este invoice" : "This invoice's payout"}
            </div>
            <ul className="space-y-1.5">
              {involved.map((row, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{row.name}</span>
                    <span className="text-xs text-muted-foreground ml-1.5">{row.role}</span>
                  </span>
                  <span className="font-mono shrink-0">{fmtMoney(row.amount, s.company.currency)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {entries.length === 0 ? (
          <div className="text-sm text-muted-foreground border border-dashed rounded-md p-6 text-center">
            {t("tl_no_events")}
          </div>
        ) : (
          <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
            {entries.map((e, i) => {
              const Icon =
                e.source === "invoice"
                  ? Receipt
                  : e.source === "split"
                    ? SplitIcon
                    : e.source === "pdf"
                      ? FileText
                      : MessageSquare;
              return (
                <li
                  key={i}
                  className="flex items-start gap-3 border-l-2 border-primary/40 pl-3 py-1"
                >
                  <Icon className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      <span className="font-mono text-muted-foreground">
                        {e.at.slice(0, 16).replace("T", " ")}
                      </span>
                      <span className="font-semibold">{e.action}</span>
                      <span className="text-muted-foreground">{t("tl_by")} {e.by}</span>
                      {e.meta && (
                        <span className="text-[10px] text-muted-foreground">
                          ({e.meta})
                        </span>
                      )}
                    </div>
                    {e.message && (
                      <div className="text-sm break-words">{e.message}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
