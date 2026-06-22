import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useStore } from "@/lib/commission-store";
import { supabase } from "@/integrations/supabase/client";
import {
  isUuid,
  adaptCompany, companyToRow,
  adaptAgent, agentToRow,
  adaptFinanceCo, financeCoToRow,
  adaptInvoice, invoiceCoreToRow,
  adaptPayment, paymentToRow,
  adaptAdjustment, adjustmentToRow,
  adaptDispute, disputeToRow,
  adaptNotification, notificationToRow,
  adaptPersonalTier, adaptOverrideLevel,
  adaptSplitTemplate, splitTemplateToRow, splitTemplatePositionsToRows,
  adaptSplitRule, splitRuleToRow,
  adaptProduct, productToRow,
  adaptPosition, positionToRow,
} from "@/lib/adapters";

export function useSupabaseSync() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const loadedCompanyId = useRef<string | null>(null);
  const loadComplete = useRef(false);
  const clearedStale = useRef(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  // ── LOAD ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) {
      // Authenticated but no company (e.g. superadmin not yet linked) — wipe stale localStorage once
      if (profile && !clearedStale.current) {
        useStore.setState({
          agents: [],
          financeCompanies: [],
          invoices: [],
          payments: [],
          adjustments: [],
          disputes: [],
          notifications: [],
        });
        clearedStale.current = true;
      }
      return;
    }

    // Company switched (or first load after sign-in) — wipe stale data immediately
    if (loadedCompanyId.current !== companyId) {
      useStore.setState({
        agents: [],
        financeCompanies: [],
        invoices: [],
        payments: [],
        adjustments: [],
        disputes: [],
        notifications: [],
      });
      loadComplete.current = false;
      setDataLoaded(false);
      loadedCompanyId.current = companyId;
    } else {
      // Same company already loaded — skip
      return;
    }

    async function loadData() {
      const [
        { data: company },
        { data: agents },
        { data: fcs },
        { data: invoices },
        { data: payments },
        { data: adjustments },
        { data: disputes },
        { data: notifications },
        { data: tiers },
        { data: overrideLevels },
        { data: splitTemplates },
        { data: splitRules },
        { data: products },
        { data: positions },
      ] = await Promise.all([
        supabase.from("companies").select("*").single(),
        supabase.from("agents").select("*").order("name"),
        supabase.from("finance_companies").select("*"),
        supabase
          .from("invoices")
          .select("*, invoice_line_items(*), invoice_splits(*, invoice_split_participants(*))")
          .order("date", { ascending: false }),
        supabase.from("payments").select("*"),
        supabase.from("adjustments").select("*"),
        supabase.from("disputes").select("*, dispute_events(*)"),
        supabase.from("notifications").select("*").order("at", { ascending: false }),
        supabase.from("commission_tiers").select("*").order("sort_order"),
        supabase.from("override_levels").select("*").order("level"),
        supabase.from("split_templates").select("*, split_template_positions(*)"),
        supabase.from("split_rules").select("*").order("priority", { ascending: false }),
        supabase.from("products").select("*"),
        supabase.from("compensation_positions").select("*"),
      ]);

      const update: Record<string, unknown> = {
        agents: (agents ?? []).map(adaptAgent),
        financeCompanies: (fcs ?? []).map(adaptFinanceCo),
        // cast needed: TS codegen doesn't model nested select relations
        invoices: ((invoices ?? []) as any[]).map(adaptInvoice),
        payments: (payments ?? []).map(adaptPayment),
        adjustments: (adjustments ?? []).map(adaptAdjustment),
        disputes: ((disputes ?? []) as any[]).map(adaptDispute),
        notifications: (notifications ?? []).map(adaptNotification),
      };

      if (company) {
        update.company = { ...useStore.getState().company, ...adaptCompany(company) };
      }
      if (tiers && tiers.length > 0) {
        update.personalTiers = tiers.map(adaptPersonalTier);
      }
      if (overrideLevels && overrideLevels.length > 0) {
        update.overrides = overrideLevels.map(adaptOverrideLevel);
      }
      // Only replace client defaults when Supabase has real records
      if (splitTemplates && splitTemplates.length > 0) {
        update.splitTemplates = (splitTemplates as any[]).map(adaptSplitTemplate);
      }
      if (splitRules && splitRules.length > 0) {
        update.splitRules = splitRules.map(adaptSplitRule);
      }
      if (products && products.length > 0) {
        update.products = products.map(adaptProduct);
      }
      if (positions && positions.length > 0) {
        update.positions = positions.map(adaptPosition);
      }

      useStore.setState(update);
      loadComplete.current = true;
      setDataLoaded(true);
    }

    loadData().catch((err) => {
      console.error("useSupabaseSync load error:", err);
      loadComplete.current = true;
      setDataLoaded(true);
    });
  }, [companyId]);

  // ── SYNC ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return;

    let prev = useStore.getState();

    const unsub = useStore.subscribe((next) => {
      if (!loadComplete.current) {
        prev = next;
        return;
      }

      // Agents
      syncItems(
        prev.agents, next.agents,
        (a) => supabase.from("agents").upsert(agentToRow(a, companyId), { onConflict: "id" }),
        (a) => supabase.from("agents").delete().eq("id", a.id),
      );

      // Finance companies
      syncItems(
        prev.financeCompanies, next.financeCompanies,
        (f) => supabase.from("finance_companies").upsert(financeCoToRow(f, companyId), { onConflict: "id" }),
        (f) => supabase.from("finance_companies").delete().eq("id", f.id),
      );

      // Invoices (core row + line items)
      syncItems(
        prev.invoices, next.invoices,
        async (inv) => {
          const { error } = await supabase
            .from("invoices")
            .upsert(invoiceCoreToRow(inv, companyId), { onConflict: "id" });
          if (error) { console.error("sync:invoice", error); return; }
          await supabase.from("invoice_line_items").delete().eq("invoice_id", inv.id);
          const lineItems = [
            ...inv.charges.map((c, i) => ({
              invoice_id: inv.id,
              kind: "charge" as const, label: c.label, amount: c.amount, sort_order: i,
            })),
            ...inv.credits.map((c, i) => ({
              invoice_id: inv.id,
              kind: "credit" as const, label: c.label, amount: c.amount, sort_order: i,
            })),
          ];
          if (lineItems.length > 0) {
            await supabase.from("invoice_line_items").insert(lineItems);
          }
        },
        (inv) => supabase.from("invoices").delete().eq("id", inv.id),
      );

      // Invoice splits (separate loop — needs prev comparison)
      if (prev.invoices !== next.invoices) {
        const prevInvMap = new Map(prev.invoices.map((i) => [i.id, i]));
        for (const inv of next.invoices) {
          if (!isUuid(inv.id)) continue;
          const prevInv = prevInvMap.get(inv.id);
          const splitChanged = !prevInv || JSON.stringify(prevInv.split) !== JSON.stringify(inv.split);
          if (!splitChanged) continue;

          (async () => {
            await supabase.from("invoice_splits").delete().eq("invoice_id", inv.id);
            if (!inv.split) return;
            const { data: splitRow, error: splitErr } = await supabase
              .from("invoice_splits")
              .insert({
                invoice_id: inv.id,
                applied_rule_id: inv.split.appliedRuleId ?? null,
                applied_template_id: inv.split.appliedTemplateId ?? null,
                approved_at: inv.split.approvedAt ?? null,
                approved_by: inv.split.approvedBy ?? null,
              })
              .select()
              .single();
            if (splitErr || !splitRow || inv.split.participants.length === 0) return;
            await supabase.from("invoice_split_participants").insert(
              inv.split.participants.map((p, i) => ({
                invoice_split_id: splitRow.id,
                agent_id: p.agentId ?? null,
                display_name: p.displayName,
                role: p.role,
                custom_role_label: p.customRoleLabel ?? null,
                split_percent: p.splitPercent,
                commission_level: p.commissionLevel ?? null,
                notes: p.notes ?? null,
                sort_order: i,
              }))
            );
          })().catch((e) => console.error("sync:invoice_split", e));
        }
      }

      // Payments
      syncItems(
        prev.payments, next.payments,
        (p) => supabase.from("payments").upsert(paymentToRow(p, companyId), { onConflict: "id" }),
        (p) => supabase.from("payments").delete().eq("id", p.id),
      );

      // Adjustments
      syncItems(
        prev.adjustments, next.adjustments,
        (a) => supabase.from("adjustments").upsert(adjustmentToRow(a, companyId), { onConflict: "id" }),
        (a) => supabase.from("adjustments").delete().eq("id", a.id),
      );

      // Disputes (main row)
      syncItems(
        prev.disputes, next.disputes,
        (d) => supabase.from("disputes").upsert(disputeToRow(d, companyId), { onConflict: "id" }),
        (d) => supabase.from("disputes").delete().eq("id", d.id),
      );

      // Dispute events (append-only — insert new events only)
      if (prev.disputes !== next.disputes) {
        const prevDisputeMap = new Map(prev.disputes.map((d) => [d.id, d]));
        for (const d of next.disputes) {
          if (!isUuid(d.id)) continue;
          const prevD = prevDisputeMap.get(d.id);
          const newEvents = prevD ? d.events.slice(prevD.events.length) : d.events;
          for (const ev of newEvents) {
            supabase.from("dispute_events").insert({
              dispute_id: d.id,
              at: ev.at,
              actor: ev.actor,
              type: ev.type,
              message: ev.message,
            }).then(({ error }) => { if (error) console.error("sync:dispute_event", error); });
          }
        }
      }

      // Notifications
      syncItems(
        prev.notifications, next.notifications,
        (n) => supabase.from("notifications").upsert(notificationToRow(n, companyId), { onConflict: "id" }),
        (n) => supabase.from("notifications").delete().eq("id", n.id),
      );

      // Company settings (admin-only via RLS)
      if (prev.company !== next.company) {
        supabase
          .from("companies")
          .update(companyToRow(next.company))
          .eq("id", companyId)
          .then(({ error }) => { if (error) console.error("sync:company", error); });
      }

      // personalTiers (no id → delete all + re-insert)
      if (prev.personalTiers !== next.personalTiers) {
        supabase.from("commission_tiers").delete().eq("company_id", companyId)
          .then(async ({ error }) => {
            if (error) { console.error("sync:tiers delete", error); return; }
            if (next.personalTiers.length === 0) return;
            const { error: e2 } = await supabase.from("commission_tiers").insert(
              next.personalTiers.map((t, i) => ({
                company_id: companyId,
                min_volume: t.minVolume,
                rate: t.rate,
                sort_order: i,
              }))
            );
            if (e2) console.error("sync:tiers insert", e2);
          });
      }

      // overrides (no id → delete all + re-insert)
      if (prev.overrides !== next.overrides) {
        supabase.from("override_levels").delete().eq("company_id", companyId)
          .then(async ({ error }) => {
            if (error) { console.error("sync:overrides delete", error); return; }
            if (next.overrides.length === 0) return;
            const { error: e2 } = await supabase.from("override_levels").insert(
              next.overrides.map((o) => ({
                company_id: companyId,
                level: o.level,
                rate: o.rate,
              }))
            );
            if (e2) console.error("sync:overrides insert", e2);
          });
      }

      // Split templates (with positions)
      syncItems(
        prev.splitTemplates, next.splitTemplates,
        async (tpl) => {
          const { error } = await supabase.from("split_templates").upsert(
            splitTemplateToRow(tpl, companyId), { onConflict: "id" }
          );
          if (error) { console.error("sync:split_template", error); return; }
          await supabase.from("split_template_positions").delete().eq("template_id", tpl.id);
          const rows = splitTemplatePositionsToRows(tpl);
          if (rows.length > 0) {
            await supabase.from("split_template_positions").insert(rows);
          }
        },
        (tpl) => supabase.from("split_templates").delete().eq("id", tpl.id),
      );

      // Split rules
      syncItems(
        prev.splitRules, next.splitRules,
        (r) => supabase.from("split_rules").upsert(splitRuleToRow(r, companyId), { onConflict: "id" }),
        (r) => supabase.from("split_rules").delete().eq("id", r.id),
      );

      // Products
      syncItems(
        prev.products, next.products,
        (p) => supabase.from("products").upsert(productToRow(p, companyId), { onConflict: "id" }),
        (p) => supabase.from("products").delete().eq("id", p.id),
      );

      // Compensation positions
      syncItems(
        prev.positions, next.positions,
        (p) => supabase.from("compensation_positions").upsert(positionToRow(p, companyId), { onConflict: "id" }),
        (p) => supabase.from("compensation_positions").delete().eq("id", p.id),
      );

      prev = next;
    });

    return unsub;
  }, [companyId]);

  return { dataLoaded };
}

function syncItems<T extends { id: string }>(
  prev: T[],
  next: T[],
  upsert: (item: T) => Promise<unknown> | unknown,
  remove: (item: T) => Promise<unknown> | unknown,
) {
  if (prev === next) return;
  const prevMap = new Map(prev.map((x) => [x.id, x]));
  const nextMap = new Map(next.map((x) => [x.id, x]));

  for (const item of next) {
    if (!isUuid(item.id)) continue;
    const prevItem = prevMap.get(item.id);
    if (!prevItem || JSON.stringify(prevItem) !== JSON.stringify(item)) {
      Promise.resolve(upsert(item))
        .then((res: unknown) => { if (res && typeof res === "object" && "error" in res && (res as { error: unknown }).error) console.error("sync upsert:", (res as { error: unknown }).error); })
        .catch(console.error);
    }
  }

  for (const item of prev) {
    if (!isUuid(item.id)) continue;
    if (!nextMap.has(item.id)) {
      Promise.resolve(remove(item))
        .then((res: unknown) => { if (res && typeof res === "object" && "error" in res && (res as { error: unknown }).error) console.error("sync delete:", (res as { error: unknown }).error); })
        .catch(console.error);
    }
  }
}
