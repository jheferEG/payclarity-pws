import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Search, FileDown, MessageSquare } from "lucide-react";
import { useStore, type Invoice } from "@/lib/commission-store";
import { calcInvoice, calcPayouts, fmtMoney } from "@/lib/commission-calc";
import { computeInvolved, buildWallet } from "@/lib/ledger";
import { buildInvoicePayoutStatementPDF } from "@/lib/generate-invoices";
import { DisputeDialog } from "@/components/ExtraPanels";

const PAYOUT_STATUS_LABEL: Record<string, { es: string; en: string }> = {
  pending: { es: "Pendiente", en: "Pending" },
  approved: { es: "Aprobado", en: "Approved" },
  paid: { es: "Pagado", en: "Paid" },
  rejected: { es: "Rechazado", en: "Rejected" },
};

/** An analyst's whole portal: only their own invoices, filterable by date
 * and customer, each with a view/download PDF and a "file a claim" action,
 * plus how much they've earned in total and how many systems they've sold.
 * Deliberately separate from InvoicesPanel (admin/rep) — that component's
 * edit form and admin-only controls have no place here; an analyst never
 * edits anything. */
export function AnalystInvoicesPanel() {
  const s = useStore();
  const isEs = s.language === "es";
  const cur = s.company.currency;
  const myAgentId = s.activeAgentId;
  const agent = s.agents.find((a) => a.id === myAgentId);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [disputeId, setDisputeId] = useState<string | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ name: string; url: string } | null>(null);

  const myInvoices = useMemo(
    () => s.invoices.filter((i) => i.agentId === myAgentId),
    [s.invoices, myAgentId]
  );

  const filtered = useMemo(() => {
    const search = customerSearch.trim().toLowerCase();
    return myInvoices
      .filter((i) => (!dateFrom || i.date >= dateFrom) && (!dateTo || i.date <= dateTo))
      .filter((i) => !search || (i.customerName || "").toLowerCase().includes(search))
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [myInvoices, dateFrom, dateTo, customerSearch]);

  const payout = useMemo(
    () =>
      agent
        ? calcPayouts(s.agents, s.invoices, s.financeCompanies, s.personalTiers, s.overrides, s.company.commissionEntryMode)
            .find((p) => p.agent.id === agent.id) ?? null
        : null,
    [agent, s.agents, s.invoices, s.financeCompanies, s.personalTiers, s.overrides, s.company.commissionEntryMode]
  );
  const wallet = useMemo(
    () =>
      agent && payout
        ? buildWallet(agent, payout, s.payments, s.disputes, s.adjustments, s.invoices, s.financeCompanies, s.company.commissionEntryMode)
        : null,
    [agent, payout, s.payments, s.disputes, s.adjustments, s.invoices, s.financeCompanies, s.company.commissionEntryMode]
  );

  const closePdfPreview = () => {
    if (pdfPreview) URL.revokeObjectURL(pdfPreview.url);
    setPdfPreview(null);
  };

  const myRowFor = (inv: Invoice) => {
    const c = calcInvoice(inv, s.financeCompanies);
    const rows = computeInvolved(inv, c, s.agents, s.overrides, s.language, s.company.commissionEntryMode);
    return { c, row: rows.find((r) => r.agentId === myAgentId) ?? null };
  };

  const viewPdf = (inv: Invoice) => {
    const { c, row } = myRowFor(inv);
    if (!row) return;
    const pdf = buildInvoicePayoutStatementPDF(row, c, s.company, inv.taxReservePercent, s.language);
    setPdfPreview({ name: `${inv.number} — ${row.name}`, url: pdf.output("bloburl").toString() });
  };

  const downloadPdf = (inv: Invoice) => {
    const { c, row } = myRowFor(inv);
    if (!row) return;
    const pdf = buildInvoicePayoutStatementPDF(row, c, s.company, inv.taxReservePercent, s.language);
    pdf.save(`${inv.number}_statement.pdf`);
  };

  if (!agent) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {isEs
            ? "No se encontró tu perfil de analista vinculado. Pide a un administrador que lo revise."
            : "Your linked analyst profile wasn't found. Ask an administrator to check it."}
        </p>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {isEs ? "Total ganado" : "Total earned"}
            </p>
            <p className="text-2xl font-bold mt-1">{fmtMoney(wallet?.totalEarned ?? 0, cur)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {isEs ? "Número de sistemas" : "Number of systems"}
            </p>
            <p className="text-2xl font-bold mt-1">{myInvoices.length}</p>
          </Card>
        </div>

        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{isEs ? "Desde" : "From"}</label>
              <Input type="date" className="h-9" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{isEs ? "Hasta" : "To"}</label>
              <Input type="date" className="h-9" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground block mb-1">{isEs ? "Buscar cliente" : "Search customer"}</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 pl-8"
                  placeholder={isEs ? "Nombre del cliente" : "Customer name"}
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
              </div>
            </div>
            {(dateFrom || dateTo || customerSearch) && (
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); setCustomerSearch(""); }}>
                {isEs ? "Limpiar filtros" : "Clear filters"}
              </Button>
            )}
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {isEs ? "No hay invoices para este filtro." : "No invoices match this filter."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="py-2">#</th>
                    <th>{isEs ? "Fecha" : "Date"}</th>
                    <th>{isEs ? "Cliente" : "Customer"}</th>
                    <th>{isEs ? "Estado" : "Status"}</th>
                    <th>{isEs ? "Pago" : "Payout"}</th>
                    <th className="text-right">{isEs ? "Monto" : "Amount"}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv) => {
                    const { row } = myRowFor(inv);
                    const doc = s.payoutDocuments.find((d) => d.invoiceId === inv.id && d.agentId === myAgentId);
                    const payLabel = doc
                      ? PAYOUT_STATUS_LABEL[doc.status]?.[isEs ? "es" : "en"] ?? doc.status
                      : (isEs ? "Sin generar" : "Not generated");
                    return (
                      <tr key={inv.id} className="border-t border-border/60">
                        <td className="py-2 font-mono text-xs">{inv.number}</td>
                        <td className="font-mono text-xs">{inv.date}</td>
                        <td className="font-medium">{inv.customerName || "—"}</td>
                        <td><Badge variant="outline" className="text-xs uppercase">{inv.status}</Badge></td>
                        <td>
                          <Badge variant={doc?.status === "paid" ? "default" : doc?.status === "rejected" ? "destructive" : "outline"} className="text-xs">
                            {payLabel}
                          </Badge>
                        </td>
                        <td className="text-right font-mono">{fmtMoney(row?.amount ?? 0, cur)}</td>
                        <td className="text-right whitespace-nowrap">
                          <Button variant="ghost" size="sm" onClick={() => viewPdf(inv)}>
                            <FileDown className="w-3.5 h-3.5 mr-1" />{isEs ? "Ver" : "View"}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => downloadPdf(inv)}>
                            {isEs ? "Descargar" : "Download"}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDisputeId(inv.id)}>
                            <MessageSquare className="w-3.5 h-3.5 mr-1" />{isEs ? "Reclamo" : "Claim"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <DisputeDialog invoiceId={disputeId} open={!!disputeId} onClose={() => setDisputeId(null)} />

      <Dialog open={!!pdfPreview} onOpenChange={(o) => !o && closePdfPreview()}>
        <DialogContent className="max-w-3xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{pdfPreview?.name}</DialogTitle>
          </DialogHeader>
          {pdfPreview && (
            <iframe src={pdfPreview.url} title={pdfPreview.name} className="w-full flex-1 rounded-md border border-border" />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closePdfPreview}>{isEs ? "Cerrar" : "Close"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
