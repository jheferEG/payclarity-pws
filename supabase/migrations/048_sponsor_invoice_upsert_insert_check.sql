-- Transpare: the sponsor update policy (044/046/047) still rejected a
-- sponsor's save with the same RLS error, even with correct data and a
-- correct UPDATE policy verified directly against pg_policies.
--
-- Root cause: the client saves invoices via upsert (INSERT ... ON CONFLICT
-- (id) DO UPDATE). Postgres always checks the proposed row against the
-- table's INSERT policies first — even when the row already exists and the
-- statement is really going to resolve as an UPDATE — before it ever
-- considers the ON CONFLICT DO UPDATE branch and its own USING/WITH CHECK.
-- A sponsor (non-admin) had no INSERT policy covering a downline agent's
-- invoice at all: invoices_insert_rep only allows agent_id = my_agent_id()
-- (your own sales), invoices_insert_admin requires is_admin(). So the
-- upsert's INSERT-side check failed before the UPDATE policy was ever
-- reached, no matter how correct that UPDATE policy was.
-- Depends on: 001-047

create policy "invoices_insert_sponsor"
  on public.invoices for insert
  with check (
    company_id = public.my_company_id()
    and agent_id in (
      select id from public.agents where sponsor_id = public.my_agent_id()
    )
  );
