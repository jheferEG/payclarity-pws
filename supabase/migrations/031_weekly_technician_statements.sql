-- Transpare: Weekly Technician Statements — Phase 3 of
-- "Billing & Technician Payables"
--
-- Consolidates one technician's approved Work Statements for a pay period
-- into a single payable batch. A Work Statement belongs to at most one
-- active batch (double-payment prevention, per the client's spec) —
-- generating a batch stamps weekly_statement_id on each work statement it
-- includes, so the app never lets it be picked up by a second batch.
-- Marking a batch paid posts to the existing payments table (same as
-- payout_documents already does), so it surfaces in the Payout Calendar
-- and year-end 1099 totals without a parallel payment system.
-- Depends on: 001-030

create table if not exists public.weekly_technician_statements (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  number             text not null default '',
  technician_id      uuid not null references public.agents(id) on delete cascade,
  period_start       date not null,
  period_end         date not null,
  status             text not null default 'locked'
                       check (status in ('open','locked','approved','paid')),
  work_statement_ids uuid[] not null default '{}',
  adjustments        jsonb not null default '[]'::jsonb,
  approved_at        timestamptz,
  approved_by        text,
  paid_at            timestamptz,
  payment_reference  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.weekly_technician_statements enable row level security;

create policy "weekly_technician_statements_select"
  on public.weekly_technician_statements for select
  using (company_id = public.my_company_id());

create policy "weekly_technician_statements_insert_admin"
  on public.weekly_technician_statements for insert
  with check (public.is_admin() and company_id = public.my_company_id());

create policy "weekly_technician_statements_update_admin"
  on public.weekly_technician_statements for update
  using (public.is_admin() and company_id = public.my_company_id());

create policy "weekly_technician_statements_delete_admin"
  on public.weekly_technician_statements for delete
  using (public.is_admin() and company_id = public.my_company_id());

drop trigger if exists set_weekly_technician_statements_updated_at on public.weekly_technician_statements;
create trigger set_weekly_technician_statements_updated_at
  before update on public.weekly_technician_statements
  for each row execute function public.handle_updated_at();
