import { useEffect, useRef, useState, useCallback } from "react";
import {
  Search,
  X,
  Users,
  Receipt,
  Wallet,
  Building2,
} from "lucide-react";
import { useStore } from "@/lib/commission-store";
import { fmtMoney } from "@/lib/commission-calc";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (tab: string, id?: string) => void;
}

interface SearchResult {
  id: string;
  tab: string;
  // What onNavigate should jump to — usually the same as `id`, except for
  // payments: the result is keyed by the payment's own id (for a stable
  // React key) but navigating should land on the agent's wallet, since
  // there's no per-payment view to land on.
  navId: string;
  label: string;
  secondary: string;
  icon: React.ReactNode;
}

interface ResultGroup {
  category: string;
  results: SearchResult[];
  offset: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GlobalSearch({ open, onClose, onNavigate }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { agents, invoices, payments, financeCompanies } = useStore();

  // Focus input and reset state on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setFocusedIndex(0);
      // Short delay so the DOM is mounted before we try to focus
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Reset focused index whenever results change
  useEffect(() => {
    setFocusedIndex(0);
  }, [query]);

  // ── Search logic ─────────────────────────────────────────────────────────────

  const q = query.trim().toLowerCase();

  const agentResults: SearchResult[] = q
    ? agents
        .filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.email.toLowerCase().includes(q) ||
            (a.level ?? "").toLowerCase().includes(q)
        )
        .slice(0, 5)
        .map((a) => ({
          id: a.id,
          tab: "agents",
          navId: a.id,
          label: a.name,
          secondary: [a.email, a.level].filter(Boolean).join(" · "),
          icon: <Users size={14} />,
        }))
    : [];

  const invoiceResults: SearchResult[] = q
    ? invoices
        .filter(
          (inv) =>
            (inv.number ?? "").toLowerCase().includes(q) ||
            (inv.customerName ?? "").toLowerCase().includes(q)
        )
        .slice(0, 5)
        .map((inv) => ({
          id: inv.id,
          tab: "invoices",
          navId: inv.id,
          label: inv.number || inv.customerName || inv.id,
          secondary: [
            inv.customerName,
            fmtMoney(inv.salesAmount),
            inv.status,
          ]
            .filter(Boolean)
            .join(" · "),
          icon: <Receipt size={14} />,
        }))
    : [];

  const paymentResults: SearchResult[] = q
    ? payments
        .filter((p) => {
          const agent = agents.find((a) => a.id === p.agentId);
          return (
            (agent?.name ?? "").toLowerCase().includes(q) ||
            String(p.amount).includes(q)
          );
        })
        .slice(0, 5)
        .map((p) => {
          const agent = agents.find((a) => a.id === p.agentId);
          return {
            id: p.id,
            tab: "wallet",
            navId: p.agentId,
            label: agent?.name ?? "Unknown Agent",
            secondary: [fmtMoney(p.amount), p.method, p.date]
              .filter(Boolean)
              .join(" · "),
            icon: <Wallet size={14} />,
          };
        })
    : [];

  const financeResults: SearchResult[] = q
    ? financeCompanies
        .filter((fc) => fc.name.toLowerCase().includes(q))
        .slice(0, 5)
        .map((fc) => ({
          id: fc.id,
          tab: "finance",
          navId: fc.id,
          label: fc.name,
          secondary: fc.active ? "Active" : "Inactive",
          icon: <Building2 size={14} />,
        }))
    : [];

  // ── Build groups with pre-computed flat offsets ───────────────────────────────

  const rawGroups = [
    { category: "Agents / Reps", results: agentResults },
    { category: "Invoices", results: invoiceResults },
    { category: "Payments", results: paymentResults },
    { category: "Finance Companies", results: financeResults },
  ].filter((g) => g.results.length > 0);

  const groups: ResultGroup[] = rawGroups.map((g, gi) => ({
    ...g,
    offset: rawGroups.slice(0, gi).reduce((sum, prev) => sum + prev.results.length, 0),
  }));

  const totalResults = agentResults.length + invoiceResults.length + paymentResults.length + financeResults.length;

  // ── Scroll focused item into view ────────────────────────────────────────────

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-flat-index="${focusedIndex}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  // ── Keyboard handler ─────────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((i) => Math.min(i + 1, totalResults - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter": {
          // Find the result at focusedIndex across all groups
          let flat = 0;
          for (const g of groups) {
            for (const r of g.results) {
              if (flat === focusedIndex) {
                onNavigate(r.tab, r.navId);
                onClose();
                return;
              }
              flat++;
            }
          }
          break;
        }
      }
    },
    [totalResults, focusedIndex, groups, onNavigate, onClose]
  );

  if (!open) return null;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-16 sm:pt-24"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.45)" }}
      onClick={onClose}
    >
      {/* Modal card */}
      <div
        className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
      >
        {/* ── Search input row ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-200 dark:border-zinc-700">
          <Search
            size={18}
            className="text-zinc-400 dark:text-zinc-500 shrink-0"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents, invoices, payments, finance companies…"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="shrink-0 rounded-md p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>

        {/* ── Results list ──────────────────────────────────────────────────── */}
        <div
          ref={listRef}
          className="max-h-96 overflow-y-auto overscroll-contain"
        >
          {totalResults === 0 ? (
            // Empty state
            <div className="flex flex-col items-center justify-center gap-2.5 py-14 text-zinc-400 dark:text-zinc-500">
              <Search size={28} strokeWidth={1.5} className="opacity-40" />
              <span className="text-sm">
                {q ? "No results found" : "No results"}
              </span>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.category}>
                {/* Category header */}
                <div className="sticky top-0 z-10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-100 dark:border-zinc-700/50">
                  {group.category}
                </div>

                {/* Results */}
                {group.results.map((result, i) => {
                  const flatIdx = group.offset + i;
                  const isFocused = flatIdx === focusedIndex;

                  return (
                    <button
                      key={result.id}
                      type="button"
                      data-flat-index={flatIdx}
                      onClick={() => {
                        onNavigate(result.tab, result.navId);
                        onClose();
                      }}
                      onMouseEnter={() => setFocusedIndex(flatIdx)}
                      className={[
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        isFocused
                          ? "bg-blue-50 dark:bg-blue-950/40"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40",
                      ].join(" ")}
                    >
                      {/* Icon */}
                      <span
                        className={[
                          "shrink-0 transition-colors",
                          isFocused
                            ? "text-blue-500 dark:text-blue-400"
                            : "text-zinc-400 dark:text-zinc-500",
                        ].join(" ")}
                      >
                        {result.icon}
                      </span>

                      {/* Text */}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                          {result.label}
                        </div>
                        {result.secondary ? (
                          <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                            {result.secondary}
                          </div>
                        ) : null}
                      </div>

                      {/* Enter hint when focused */}
                      {isFocused ? (
                        <span className="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
                          ↵
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* ── Footer keyboard hints ─────────────────────────────────────────── */}
        {totalResults > 0 ? (
          <div className="flex items-center gap-4 px-4 py-2 border-t border-zinc-100 dark:border-zinc-700/50 text-[11px] text-zinc-400 dark:text-zinc-500">
            <span>
              <kbd className="font-mono font-semibold">↑↓</kbd>
              {" "}Navigate
            </span>
            <span>
              <kbd className="font-mono font-semibold">↵</kbd>
              {" "}Select
            </span>
            <span>
              <kbd className="font-mono font-semibold">Esc</kbd>
              {" "}Close
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
