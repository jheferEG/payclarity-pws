import { useEffect, useMemo, useState } from "react";
import { Bell, Check, Trash2, Search, ArrowDownNarrowWide, ArrowUpNarrowWide, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useStore, type Notification, type NotificationKind } from "@/lib/commission-store";
import { useT } from "@/lib/i18n";

type KindFilter = "all" | "submitted" | "replied" | "status" | "split" | "pdf";
type SortOrder = "newest" | "oldest";
const SORT_KEY = "notifications.sortOrder";
const KIND_KEY = "notifications.kindFilter";
const INVOICE_KEY = "notifications.invoiceFilter";
const SEARCH_KEY = "notifications.search";
const UNREAD_KEY = "notifications.unreadOnly";

function getKindFilters(t: (k: any) => string) {
  return [
    { value: "all" as KindFilter, label: t("notif_filter_all"), kinds: [] as NotificationKind[] },
    { value: "submitted" as KindFilter, label: t("notif_filter_submitted"), kinds: ["dispute_submitted"] as NotificationKind[] },
    { value: "replied" as KindFilter, label: t("notif_filter_replied"), kinds: ["dispute_replied"] as NotificationKind[] },
    { value: "status" as KindFilter, label: t("notif_filter_status"), kinds: ["dispute_status", "dispute_claimed"] as NotificationKind[] },
    { value: "split" as KindFilter, label: t("notif_filter_splits"), kinds: ["split_changed"] as NotificationKind[] },
    { value: "pdf" as KindFilter, label: t("notif_filter_pdfs"), kinds: ["pdf_regenerated"] as NotificationKind[] },
  ];
}

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function writeLS(key: string, v: unknown) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, JSON.stringify(v));
  }
}

export function NotificationsBell() {
  const t = useT();
  const KIND_FILTERS = getKindFilters(t);
  const s = useStore();
  const [open, setOpen] = useState(false);
  const [kindFilter, setKindFilter] = useState<KindFilter>(() => readLS<KindFilter>(KIND_KEY, "all"));
  const [invoiceFilter, setInvoiceFilter] = useState<string>(() => readLS<string>(INVOICE_KEY, "all"));
  const [search, setSearch] = useState<string>(() => readLS<string>(SEARCH_KEY, ""));
  const [unreadOnly, setUnreadOnly] = useState<boolean>(() => readLS<boolean>(UNREAD_KEY, false));
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => readLS<SortOrder>(SORT_KEY, "newest"));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<null | { ids: string[]; mode: "selected" | "all" }>(null);

  useEffect(() => writeLS(SORT_KEY, sortOrder), [sortOrder]);
  useEffect(() => writeLS(KIND_KEY, kindFilter), [kindFilter]);
  useEffect(() => writeLS(INVOICE_KEY, invoiceFilter), [invoiceFilter]);
  useEffect(() => writeLS(SEARCH_KEY, search), [search]);
  useEffect(() => writeLS(UNREAD_KEY, unreadOnly), [unreadOnly]);

  // Cross-tab sync: react to localStorage changes from other tabs.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== window.localStorage || e.newValue === null) return;
      try {
        const v = JSON.parse(e.newValue);
        if (e.key === SORT_KEY && (v === "newest" || v === "oldest")) {
          setSortOrder((cur) => (cur === v ? cur : v));
        } else if (e.key === UNREAD_KEY && typeof v === "boolean") {
          setUnreadOnly((cur) => (cur === v ? cur : v));
        } else if (e.key === KIND_KEY && typeof v === "string") {
          setKindFilter((cur) => (cur === v ? cur : (v as KindFilter)));
        } else if (e.key === INVOICE_KEY && typeof v === "string") {
          setInvoiceFilter((cur) => (cur === v ? cur : v));
        } else if (e.key === SEARCH_KEY && typeof v === "string") {
          setSearch((cur) => (cur === v ? cur : v));
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const audience: Notification["audience"] = useMemo(
    () => ((s.role === "rep" || s.role === "technician") && s.activeAgentId
      ? { agentId: s.activeAgentId }
      : "admin"),
    [s.role, s.activeAgentId]
  );

  const mine = useMemo(() => {
    return s.notifications.filter((n) =>
      audience === "admin"
        ? n.audience === "admin"
        : typeof n.audience === "object" && n.audience.agentId === audience.agentId
    );
  }, [s.notifications, audience]);

  const invoiceOptions = useMemo(() => {
    const ids = new Set<string>();
    mine.forEach((n) => n.invoiceId && ids.add(n.invoiceId));
    return Array.from(ids)
      .map((id) => ({ id, number: s.invoices.find((i) => i.id === id)?.number ?? id }))
      .sort((a, b) => a.number.localeCompare(b.number));
  }, [mine, s.invoices]);

  const unreadByFilter = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchesSearch = (n: Notification) => {
      if (!q) return true;
      const inv = n.invoiceId ? s.invoices.find((i) => i.id === n.invoiceId) : null;
      const hay = [n.title, n.message, inv?.number, inv?.customerName]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    };
    const matchesInvoice = (n: Notification) =>
      invoiceFilter === "all" ? true : n.invoiceId === invoiceFilter;
    const result: Record<KindFilter, number> = {
      all: 0, submitted: 0, replied: 0, status: 0, split: 0, pdf: 0,
    };
    for (const n of mine) {
      if (n.read) continue;
      if (!matchesSearch(n) || !matchesInvoice(n)) continue;
      for (const f of KIND_FILTERS) {
        if (f.value === "all" || f.kinds.includes(n.kind)) result[f.value]++;
      }
    }
    return result;
  }, [mine, s.invoices, search, invoiceFilter]);

  const list = useMemo(() => {
    const allowedKinds = KIND_FILTERS.find((f) => f.value === kindFilter)?.kinds ?? [];
    const q = search.trim().toLowerCase();
    const filtered = mine
      .filter((n) => (allowedKinds.length === 0 ? true : allowedKinds.includes(n.kind)))
      .filter((n) => (invoiceFilter === "all" ? true : n.invoiceId === invoiceFilter))
      .filter((n) => (unreadOnly ? !n.read : true))
      .filter((n) => {
        if (!q) return true;
        const inv = n.invoiceId ? s.invoices.find((i) => i.id === n.invoiceId) : null;
        const hay = [n.title, n.message, inv?.number, inv?.customerName]
          .filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
    return filtered.sort((a, b) =>
      sortOrder === "newest" ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at)
    );
  }, [mine, kindFilter, invoiceFilter, search, unreadOnly, s.invoices, sortOrder]);

  const unread = mine.filter((n) => !n.read).length;
  const visibleIds = useMemo(() => list.map((n) => n.id), [list]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAllVisible = () => {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...visibleIds]);
    });
  };
  const bulkMarkRead = () => {
    if (unreadOnly) {
      // mark only unread visible
      visibleIds.filter((id) => selected.has(id)).forEach((id) => s.markNotificationRead(id));
    } else {
      selected.forEach((id) => s.markNotificationRead(id));
    }
    setSelected(new Set());
  };
  const markAllVisibleRead = () => {
    visibleIds.forEach((id) => {
      const n = mine.find((m) => m.id === id);
      if (n && !n.read) s.markNotificationRead(id);
    });
  };

  const performDelete = (ids: string[]) => {
    const snapshot = mine.filter((n) => ids.includes(n.id));
    s.removeNotifications(ids);
    setSelected(new Set());
    toast.success(t("notif_deleted"), {
      action: {
        label: t("notif_undo"),
        onClick: () => {
          s.restoreNotifications(snapshot);
          toast.success(t("notif_restored"));
        },
      },
      duration: 8000,
    });
  };

  const handleClick = (n: Notification) => {
    s.markNotificationRead(n.id);
    if (n.invoiceId || n.disputeId) {
      const tab = n.disputeId ? "disputes" : "invoices";
      s.setDeepLink({
        ts: Date.now(),
        tab,
        invoiceId: n.invoiceId,
        disputeId: n.disputeId,
        openTimeline: !!n.invoiceId && !n.disputeId,
        openDispute: !!n.disputeId,
      });
    }
    setOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className="relative" aria-label={t("notif_title")}>
            <Bell className="w-4 h-4" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                {unread}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[440px] p-0">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="text-sm font-semibold">{t("notif_title")}</div>
            <div className="flex items-center gap-1">
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
                {sortOrder === "newest" ? t("notif_newest").split(" ")[0] : t("notif_oldest").split(" ")[0]}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={markAllVisibleRead}
                disabled={unread === 0}
                title={t("notif_mark_all")}
              >
                <Check className="w-3 h-3 mr-1" />
                {t("notif_mark_read")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() =>
                  setConfirm({ ids: visibleIds, mode: "all" })
                }
                disabled={visibleIds.length === 0}
                title={unreadOnly ? t("notif_clear_visible") : t("notif_clear_all")}
              >
                <Trash2 className="w-3 h-3 mr-1" />
                {t("notif_clear")}
              </Button>
            </div>
          </div>
          <div className="px-3 py-2 border-b space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("notif_search")}
                className="h-7 pl-7 text-xs"
              />
            </div>
            <div className="flex flex-wrap gap-1 items-center">
              {KIND_FILTERS.map((f) => {
                const count = unreadByFilter[f.value];
                const active = kindFilter === f.value;
                return (
                  <Button
                    key={f.value}
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className="h-6 px-2 text-[11px] gap-1"
                    onClick={() => setKindFilter(f.value)}
                  >
                    {f.label}
                    {count > 0 && (
                      <span
                        className={`ml-0.5 min-w-[1rem] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                          active
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-destructive text-destructive-foreground"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </Button>
                );
              })}
              <Button
                size="sm"
                variant={unreadOnly ? "default" : "outline"}
                className="h-6 px-2 text-[11px] gap-1 ml-auto"
                onClick={() => setUnreadOnly((v) => !v)}
                title={t("notif_unread_only")}
              >
                <Eye className="w-3 h-3" />
                {t("notif_unread_only")}
              </Button>
            </div>
            <Select value={invoiceFilter} onValueChange={setInvoiceFilter}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("notif_all_invoices")}</SelectItem>
                {invoiceOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {list.length > 0 && (
            <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleAllVisible}
                />
                {someSelected ? `${selected.size} ${t("notif_selected")}` : t("notif_select_all")}
              </label>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={bulkMarkRead}
                  disabled={!someSelected}
                >
                  <Check className="w-3 h-3 mr-1" /> {t("notif_mark_read")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px] text-destructive"
                  onClick={() =>
                    setConfirm({ ids: Array.from(selected), mode: "selected" })
                  }
                  disabled={!someSelected}
                >
                  <Trash2 className="w-3 h-3 mr-1" /> {t("notif_delete")}
                </Button>
              </div>
            </div>
          )}
          <div className="max-h-[60vh] overflow-y-auto">
            {list.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-8">
                {t("notif_no_match")}
              </div>
            ) : (
              <ul className="divide-y">
                {list.map((n) => {
                  const inv = n.invoiceId
                    ? s.invoices.find((i) => i.id === n.invoiceId)
                    : null;
                  const clickable = !!(n.invoiceId || n.disputeId);
                  const isSel = selected.has(n.id);
                  return (
                    <li
                      key={n.id}
                      className={`px-3 py-2 text-sm flex items-start gap-2 ${
                        n.read ? "" : "bg-accent/30"
                      } ${isSel ? "bg-accent/60" : ""}`}
                    >
                      <Checkbox
                        checked={isSel}
                        onCheckedChange={() => toggleOne(n.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1"
                      />
                      <div
                        className={`flex-1 min-w-0 ${clickable ? "cursor-pointer" : ""}`}
                        onClick={() => clickable && handleClick(n)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-medium">{n.title}</div>
                          <div className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                            {n.at.slice(5, 16).replace("T", " ")}
                          </div>
                        </div>
                        {n.message && (
                          <div className="text-xs text-muted-foreground mt-0.5 break-words">
                            {n.message}
                          </div>
                        )}
                        {(inv || n.disputeId) && (
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-primary">
                            {inv && <span className="font-mono">→ {inv.number}</span>}
                            {n.disputeId && <span>{t("notif_open_request")}</span>}
                            {n.invoiceId && !n.disputeId && <span>{t("notif_view_timeline")}</span>}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("notif_delete_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("notif_delete_desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("btn_cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) performDelete(confirm.ids);
                setConfirm(null);
              }}
            >
              {t("notif_delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
