-- Transpare: Payment Treatment + masked Tax IDs
--
-- Two of the remaining "Financial Integrity, Security, Payroll Separation"
-- items the client asked for:
--
-- 1. payment_treatment on agents: an independent third axis alongside
--    `level` (service role) and `payroll_type` (worker relationship/legal
--    classification) — which system actually pays this agent for
--    job-based work. Usually mirrors payroll_type, but can diverge on
--    purpose (e.g. a W-2 installer still paid piece-rate through Work
--    Statements). NULL = infer from payroll_type (see
--    resolvePaymentTreatment() in commission-store.ts) — existing data
--    behaves exactly as before.
--
-- 2. agent_tax_ids: a SEPARATE table (not a column on `agents`) for a
--    technician's tax ID — MASKED, last 4 digits only, never the full
--    SSN/EIN. It has to be a separate table because `agents` RLS is
--    company-wide SELECT (every rep/technician can read every other
--    agent's row) — Postgres RLS is row-level, not column-level, so a
--    sensitive column bolted onto `agents` would be readable by anyone in
--    the company. This table's own SELECT policy restricts it to
--    admin/accountant, matching the client's "masked + restricted" ask.
--
-- Depends on: 001-033

alter table public.agents
  add column if not exists payment_treatment text check (payment_treatment in ('payroll', 'contractor_payables'));

create table if not exists public.agent_tax_ids (
  agent_id      uuid primary key references public.agents(id) on delete cascade,
  company_id    uuid not null references public.companies(id) on delete cascade,
  tax_id_last4  text not null default '' check (tax_id_last4 = '' or tax_id_last4 ~ '^[0-9]{4}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.agent_tax_ids enable row level security;

create policy "agent_tax_ids_select"
  on public.agent_tax_ids for select
  using (
    company_id = public.my_company_id()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'accountant')
    )
  );

create policy "agent_tax_ids_insert_admin"
  on public.agent_tax_ids for insert
  with check (public.is_admin() and company_id = public.my_company_id());

create policy "agent_tax_ids_update_admin"
  on public.agent_tax_ids for update
  using (public.is_admin() and company_id = public.my_company_id());

create policy "agent_tax_ids_delete_admin"
  on public.agent_tax_ids for delete
  using (public.is_admin() and company_id = public.my_company_id());

drop trigger if exists set_agent_tax_ids_updated_at on public.agent_tax_ids;
create trigger set_agent_tax_ids_updated_at
  before update on public.agent_tax_ids
  for each row execute function public.handle_updated_at();
