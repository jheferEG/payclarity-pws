-- Transpare: re-apply the sponsor invoice-update policy, idempotently
--
-- 044 added "invoices_update_sponsor" so a sponsor could save a discount/
-- credit or an approval on a downline invoice. In production the policy
-- never actually landed — is_sponsor_of() exists and works (verified via
-- RPC), but the UPDATE still gets rejected by RLS for every sponsor,
-- meaning the "create policy" statement from 044 never ran even though the
-- function statement before it did (044 was a single multi-statement file,
-- and this repo has repeatedly hit "cannot insert multiple commands into a
-- prepared statement" applying those by hand — this looks like the same
-- failure mode, just caught later this time). Safe to run even if 044 did
-- apply cleanly somewhere: drops the policy first so re-creating it never
-- errors on "already exists".
-- Depends on: 001-045

drop policy if exists "invoices_update_sponsor" on public.invoices;

create policy "invoices_update_sponsor"
  on public.invoices for update
  using (
    company_id = public.my_company_id()
    and public.is_sponsor_of(public.my_agent_id(), agent_id)
  )
  with check (
    company_id = public.my_company_id()
    and public.is_sponsor_of(public.my_agent_id(), agent_id)
  );
