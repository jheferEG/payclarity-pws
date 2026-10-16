-- Transpare: 24h manager review window for "Invoices de equipo"
--
-- A sponsor (the seller's upline / "team leader") gets 24h from the
-- invoice's creation to review a sale from their downline — approve it,
-- or add a discount/credit against their own override on that sale. If
-- they don't act in time, it's treated as approved automatically; the
-- 24h-elapsed check itself is computed live in invoiceReviewStatus()
-- (commission-store.ts) from `created_at`, never stored or cron-driven.
-- `created_at` already existed on this table but was never read into the
-- app's Invoice type until now.
-- Depends on: 001-042

alter table public.invoices
  add column if not exists manager_reviewed_at timestamptz,
  add column if not exists manager_reviewed_by text;
