-- Transpare: let the acting sponsor see (not just insert) their own
-- team_invoice_reviewed notification
--
-- The client always saves notifications via upsert (insert ... on conflict
-- do update), and Postgres uses the table's SELECT policy to check for an
-- existing row to conflict with — regardless of whether a real conflict
-- ever happens. notifications_select only allows seeing a row when
-- audience = 'admin' AND is_admin(), or audience = your own agent id. A
-- sponsor creating a "notify admin" row (audience = 'admin') can't see it
-- under either branch, which breaks the upsert's own conflict-check step
-- with the same RLS error as a straight insert rejection — same failure
-- mode migration 045 already fixed once for dispute replies, resurfacing
-- here because this row's recipient (admin) isn't the actor (the sponsor).
-- Depends on: 001-051

create policy "notifications_select_own_actor"
  on public.notifications for select
  using (
    company_id = public.my_company_id()
    and actor_agent_id = public.my_agent_id()
  );
