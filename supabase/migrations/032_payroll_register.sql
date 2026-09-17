-- Transpare: Payroll Register — Phase 4 of "Billing & Technician Payables"
--
-- W-2 EMPLOYEES ONLY, kept entirely separate from the 1099/vendor
-- contractor payables built in Phases 2-3 (Work Statements/Weekly
-- Statements/Company Payables) — nothing here reads or writes those.
--
-- IMPORTANT: this is not a payroll tax filer or a replacement for a
-- licensed payroll provider. It prepares numbers for review/export;
-- any tax withholding is always an internal estimate, never an official
-- calculation, and should never be presented to a user as such.
-- Depends on: 001-031

alter table public.agents
  add column if not exists payroll_type text check (payroll_type in ('w2', 'contractor'));

alter table public.compensation_positions
  add column if not exists hourly_rate numeric(14,2),
  add column if not exists overtime_multiplier numeric(6,2);

create table if not exists public.payroll_registers (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  number       text not null default '',
  period_start date not null,
  period_end   date not null,
  status       text not null default 'draft' check (status in ('draft','approved','paid')),
  entries      jsonb not null default '[]'::jsonb,
  approved_at  timestamptz,
  approved_by  text,
  paid_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.payroll_registers enable row level security;

-- Payroll is admin/accountant territory only — not even a company-wide read,
-- unlike the contractor-side documents (this carries wage/tax data).
create policy "payroll_registers_select"
  on public.payroll_registers for select
  using (
    company_id = public.my_company_id()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'accountant')
    )
  );

create policy "payroll_registers_insert_admin"
  on public.payroll_registers for insert
  with check (public.is_admin() and company_id = public.my_company_id());

create policy "payroll_registers_update_admin"
  on public.payroll_registers for update
  using (public.is_admin() and company_id = public.my_company_id());

create policy "payroll_registers_delete_admin"
  on public.payroll_registers for delete
  using (public.is_admin() and company_id = public.my_company_id());

drop trigger if exists set_payroll_registers_updated_at on public.payroll_registers;
create trigger set_payroll_registers_updated_at
  before update on public.payroll_registers
  for each row execute function public.handle_updated_at();
