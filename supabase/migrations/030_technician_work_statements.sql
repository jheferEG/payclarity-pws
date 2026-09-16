-- Transpare: Rate Plans + Technician Work Statements — Phase 2 of
-- "Billing & Technician Payables"
--
-- Rate Plans: more specific rate rules than a position's two flat
-- installFixedPay/serviceFixedPay numbers — matched by job type/
-- territory/product, highest priority active match wins. Stored as
-- jsonb on compensation_positions, same precedent as extras/
-- customer_payments elsewhere.
--
-- Technician Work Statement: the approval/audit/attachments workflow
-- layer on top of a "general invoice" job (isGeneralInvoice=true). It
-- never touches the invoice's fixed_pay/extras — those still drive
-- calcPayouts. Same 1:1-with-the-master-Invoice pattern as
-- payout_documents/customer_invoices.
-- Depends on: 001-029

alter table public.compensation_positions
  add column if not exists rate_rules jsonb;

create table if not exists public.technician_work_statements (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references public.companies(id) on delete cascade,
  number                 text not null default '',
  invoice_id             uuid not null references public.invoices(id) on delete cascade,
  technician_id          uuid not null references public.agents(id) on delete cascade,
  status                 text not null default 'draft'
                           check (status in ('draft','submitted','approved','rejected','paid')),
  rate_rule_id           text,
  rate_label_snapshot    text not null default '',
  base_rate_snapshot     numeric(14,2) not null default 0,
  mileage_rate_snapshot  numeric(14,2) not null default 0,
  mileage                numeric(14,2) not null default 0,
  material_reimbursement numeric(14,2) not null default 0,
  deductions             numeric(14,2) not null default 0,
  chargebacks            numeric(14,2) not null default 0,
  corrections            numeric(14,2) not null default 0,
  notes                  text not null default '',
  attachments            jsonb not null default '[]'::jsonb,
  approval_history       jsonb not null default '[]'::jsonb,
  weekly_statement_id    uuid,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.technician_work_statements enable row level security;

-- All company members can read; a technician needs to see their own
create policy "technician_work_statements_select"
  on public.technician_work_statements for select
  using (company_id = public.my_company_id());

-- Admins manage freely
create policy "technician_work_statements_insert_admin"
  on public.technician_work_statements for insert
  with check (public.is_admin() and company_id = public.my_company_id());

create policy "technician_work_statements_update_admin"
  on public.technician_work_statements for update
  using (public.is_admin() and company_id = public.my_company_id());

create policy "technician_work_statements_delete_admin"
  on public.technician_work_statements for delete
  using (public.is_admin() and company_id = public.my_company_id());

-- A technician can create/update their own draft/submitted statements
-- (fill in mileage, materials, attach photos, submit for approval) —
-- but not approve/reject their own, and not touch anyone else's.
create policy "technician_work_statements_insert_own"
  on public.technician_work_statements for insert
  with check (
    company_id = public.my_company_id()
    and technician_id = public.my_agent_id()
  );

create policy "technician_work_statements_update_own"
  on public.technician_work_statements for update
  using (
    company_id = public.my_company_id()
    and technician_id = public.my_agent_id()
    and status in ('draft','submitted')
  );

drop trigger if exists set_technician_work_statements_updated_at on public.technician_work_statements;
create trigger set_technician_work_statements_updated_at
  before update on public.technician_work_statements
  for each row execute function public.handle_updated_at();
