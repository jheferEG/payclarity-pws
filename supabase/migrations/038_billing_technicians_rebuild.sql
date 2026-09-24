-- Transpare: Billing & Technicians rebuild, matching the client's Lovable
-- mockups (Job as the central operational entity, separate Rate Plans and
-- Technicians screens, Weekly Statements with duplicate-batch protection,
-- Company Payables report, Payroll Register with configurable withholding
-- lines, Tax Filing / Form 1099-NEC).
--
-- No production data existed yet in customer_invoices / technician_work_
-- statements / weekly_technician_statements / payroll_registers (confirmed
-- with the client), so these are dropped and recreated with the new shape
-- rather than migrated column-by-column.
-- Depends on: 001-037

-- ── 1. Agent (Technician) fields ─────────────────────────────────────────────
alter table public.agents
  add column if not exists phone text,
  add column if not exists classification text check (
    classification in ('installer','plumber','electrician','service_tech','lead_tech','apprentice','subcontractor')
  ),
  add column if not exists active boolean not null default true,
  add column if not exists technician_notes text;

-- ── 2. Company-wide Billing settings ─────────────────────────────────────────
alter table public.companies
  add column if not exists allow_multiple_original_statements boolean not null default false,
  add column if not exists withholding_rates jsonb not null default
    '[{"id":"federal","label":"Federal income tax","percent":0.1,"active":true},
      {"id":"state","label":"State income tax","percent":0.04,"active":true},
      {"id":"ss","label":"Social Security","percent":0.062,"active":true},
      {"id":"medicare","label":"Medicare","percent":0.0145,"active":true}]'::jsonb;

-- ── 3. Jobs — the new central operational entity ─────────────────────────────
create table if not exists public.jobs (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  number             text not null default '',
  technician_id      uuid references public.agents(id) on delete set null,
  customer_name      text not null default '',
  billing_address    text not null default '',
  service_address    text not null default '',
  service_geo        jsonb,
  date               date not null default current_date,
  job_type           text not null default 'Installation',
  product_installed  text not null default '',
  territory          text not null default '',
  status             text not null default 'scheduled' check (status in ('scheduled','in_progress','completed','cancelled')),
  attachments        jsonb not null default '[]'::jsonb,
  sale_invoice_id    uuid references public.invoices(id) on delete set null,
  sales_agent_id     uuid references public.agents(id) on delete set null,
  notes              text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.jobs enable row level security;

create policy "jobs_select" on public.jobs for select
  using (company_id = public.my_company_id());
create policy "jobs_insert_admin" on public.jobs for insert
  with check (public.is_admin() and company_id = public.my_company_id());
create policy "jobs_update_admin" on public.jobs for update
  using (public.is_admin() and company_id = public.my_company_id());
create policy "jobs_delete_admin" on public.jobs for delete
  using (public.is_admin() and company_id = public.my_company_id());

drop trigger if exists set_jobs_updated_at on public.jobs;
create trigger set_jobs_updated_at before update on public.jobs
  for each row execute function public.handle_updated_at();

-- ── 4. Rate Plans ─────────────────────────────────────────────────────────────
create table if not exists public.tech_rate_plans (
  id                                uuid primary key default gen_random_uuid(),
  company_id                        uuid not null references public.companies(id) on delete cascade,
  name                              text not null default '',
  technician_id                     uuid references public.agents(id) on delete cascade,
  effective_from                    date not null default current_date,
  effective_to                      date,
  active                            boolean not null default true,
  fixed_install_rate                numeric(14,2) not null default 0,
  service_call_rate                 numeric(14,2) not null default 0,
  emergency_rate                    numeric(14,2) not null default 0,
  mileage_rate                      numeric(14,4) not null default 0,
  extra_labor_hourly_rate           numeric(14,2) not null default 0,
  material_reimbursement_percent    numeric(6,4) not null default 0,
  material_reimbursement_cap        numeric(14,2) not null default 0,
  hourly_rate                       numeric(14,2),
  overtime_multiplier               numeric(6,2),
  rules                             jsonb not null default '[]'::jsonb,
  notes                             text not null default '',
  created_at                        timestamptz not null default now(),
  updated_at                        timestamptz not null default now()
);
alter table public.tech_rate_plans enable row level security;

create policy "tech_rate_plans_select" on public.tech_rate_plans for select
  using (company_id = public.my_company_id());
create policy "tech_rate_plans_insert_admin" on public.tech_rate_plans for insert
  with check (public.is_admin() and company_id = public.my_company_id());
create policy "tech_rate_plans_update_admin" on public.tech_rate_plans for update
  using (public.is_admin() and company_id = public.my_company_id());
create policy "tech_rate_plans_delete_admin" on public.tech_rate_plans for delete
  using (public.is_admin() and company_id = public.my_company_id());

drop trigger if exists set_tech_rate_plans_updated_at on public.tech_rate_plans;
create trigger set_tech_rate_plans_updated_at before update on public.tech_rate_plans
  for each row execute function public.handle_updated_at();

-- ── 5. Customer Invoices — rebuilt around Job instead of the master sale
--       Invoice (jobId nullable, saleInvoiceId reference-only). ────────────────
drop table if exists public.customer_invoices cascade;
create table public.customer_invoices (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  number             text not null default '',
  job_id             uuid references public.jobs(id) on delete set null,
  sale_invoice_id    uuid references public.invoices(id) on delete set null,
  status             text not null default 'draft' check (
    status in ('draft','sent','viewed','partially_paid','paid','overdue','cancelled','refunded')
  ),
  customer_name      text not null default '',
  customer_email     text not null default '',
  billing_address    text not null default '',
  billing_geo        jsonb,
  service_address    text not null default '',
  service_geo        jsonb,
  invoice_date       date not null default current_date,
  due_date           date not null default current_date,
  line_items         jsonb not null default '[]'::jsonb,
  discount           numeric(14,2) not null default 0,
  tax_percent        numeric(6,4) not null default 0,
  deposit            numeric(14,2) not null default 0,
  financing_applied  numeric(14,2) not null default 0,
  payment_terms      text not null default '',
  notes              text not null default '',
  warranty_info      text not null default '',
  template_id        text,
  attachments        jsonb not null default '[]'::jsonb,
  payments           jsonb not null default '[]'::jsonb,
  history            jsonb not null default '[]'::jsonb,
  pdf_history        jsonb not null default '[]'::jsonb,
  sent_at            timestamptz,
  viewed_at          timestamptz,
  branding_snapshot  jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.customer_invoices enable row level security;

-- Admin/accountant only — a rep/technician has no legitimate reason to read
-- customer billing directly (never exposed to them in the UI either).
create policy "customer_invoices_select" on public.customer_invoices for select
  using (
    company_id = public.my_company_id()
    and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','accountant'))
  );
create policy "customer_invoices_insert_admin" on public.customer_invoices for insert
  with check (public.is_admin() and company_id = public.my_company_id());
create policy "customer_invoices_update_admin" on public.customer_invoices for update
  using (public.is_admin() and company_id = public.my_company_id());
create policy "customer_invoices_delete_admin" on public.customer_invoices for delete
  using (public.is_admin() and company_id = public.my_company_id());

drop trigger if exists set_customer_invoices_updated_at on public.customer_invoices;
create trigger set_customer_invoices_updated_at before update on public.customer_invoices
  for each row execute function public.handle_updated_at();

-- ── 6. Technician Work Statements — rebuilt around Job, with statement
--       type/duplicate tracking. ─────────────────────────────────────────────
drop table if exists public.technician_work_statements cascade;
create table public.technician_work_statements (
  id                         uuid primary key default gen_random_uuid(),
  company_id                 uuid not null references public.companies(id) on delete cascade,
  number                     text not null default '',
  job_id                     uuid not null references public.jobs(id) on delete cascade,
  technician_id              uuid not null references public.agents(id) on delete cascade,
  classification             text,
  rate_plan_id               uuid references public.tech_rate_plans(id) on delete set null,
  base_labor_rate            numeric(14,2) not null default 0,
  additional_labor           numeric(14,2) not null default 0,
  extra_plumbing             numeric(14,2) not null default 0,
  mileage_miles              numeric(10,2) not null default 0,
  mileage_rate               numeric(14,4) not null default 0,
  material_reimbursement     numeric(14,2) not null default 0,
  deductions                 numeric(14,2) not null default 0,
  chargebacks                numeric(14,2) not null default 0,
  corrections                numeric(14,2) not null default 0,
  regular_hours              numeric(8,2),
  overtime_hours             numeric(8,2),
  notes                      text not null default '',
  attachments                jsonb not null default '[]'::jsonb,
  status                     text not null default 'draft' check (status in ('draft','pending_approval','approved','rejected')),
  approval                   jsonb,
  approval_history           jsonb not null default '[]'::jsonb,
  audit                      jsonb not null default '[]'::jsonb,
  payment_status             text not null default 'unpaid' check (payment_status in ('unpaid','in_batch','partially_paid','paid')),
  included_in_weekly_batch_id uuid,
  batch_status               text,
  approved_at                timestamptz,
  paid_at                    timestamptz,
  is_adjustment              boolean not null default false,
  adjusts_statement_id       uuid,
  statement_type             text not null default 'original' check (
    statement_type in ('original','additional_visit','supplemental','correction','reimbursement_only','warranty','rework')
  ),
  related_statement_id       uuid,
  type_reason                text,
  superseded_by_id           uuid,
  superseded_at              timestamptz,
  cancelled                  boolean not null default false,
  rate_snapshot              jsonb,
  rate_overrides             jsonb not null default '[]'::jsonb,
  pdf_history                jsonb not null default '[]'::jsonb,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
alter table public.technician_work_statements enable row level security;

-- Admin/accountant see all; a technician sees only their own (never a
-- blanket company-wide read for this role, per the client's privacy ask).
create policy "technician_work_statements_select" on public.technician_work_statements for select
  using (
    company_id = public.my_company_id()
    and (
      exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','accountant'))
      or technician_id = public.my_agent_id()
    )
  );
create policy "technician_work_statements_insert_admin" on public.technician_work_statements for insert
  with check (public.is_admin() and company_id = public.my_company_id());
create policy "technician_work_statements_insert_own" on public.technician_work_statements for insert
  with check (company_id = public.my_company_id() and technician_id = public.my_agent_id());
create policy "technician_work_statements_update_admin" on public.technician_work_statements for update
  using (public.is_admin() and company_id = public.my_company_id());
create policy "technician_work_statements_update_own" on public.technician_work_statements for update
  using (
    company_id = public.my_company_id()
    and technician_id = public.my_agent_id()
    and status in ('draft','pending_approval')
  );
create policy "technician_work_statements_delete_admin" on public.technician_work_statements for delete
  using (public.is_admin() and company_id = public.my_company_id());

drop trigger if exists set_technician_work_statements_updated_at on public.technician_work_statements;
create trigger set_technician_work_statements_updated_at before update on public.technician_work_statements
  for each row execute function public.handle_updated_at();

-- ── 7. Weekly Technician Statements ──────────────────────────────────────────
drop table if exists public.weekly_technician_statements cascade;
create table public.weekly_technician_statements (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  number                text not null default '',
  technician_id         uuid not null references public.agents(id) on delete cascade,
  week_start            date not null,
  week_end              date not null,
  statement_ids         uuid[] not null default '{}',
  totals                jsonb not null default '{"base":0,"extras":0,"mileage":0,"reimbursements":0,"deductions":0,"total":0}'::jsonb,
  status                text not null default 'draft' check (
    status in ('draft','pending_review','approved','scheduled','partially_paid','paid','correction_requested','cancelled')
  ),
  approval              jsonb,
  scheduled_for         date,
  payments              jsonb not null default '[]'::jsonb,
  paid_at               timestamptz,
  correction_request    jsonb,
  reopenings            jsonb not null default '[]'::jsonb,
  audit                 jsonb not null default '[]'::jsonb,
  pdf_history           jsonb not null default '[]'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter table public.weekly_technician_statements enable row level security;

create policy "weekly_technician_statements_select" on public.weekly_technician_statements for select
  using (
    company_id = public.my_company_id()
    and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','accountant'))
  );
create policy "weekly_technician_statements_insert_admin" on public.weekly_technician_statements for insert
  with check (public.is_admin() and company_id = public.my_company_id());
create policy "weekly_technician_statements_update_admin" on public.weekly_technician_statements for update
  using (public.is_admin() and company_id = public.my_company_id());
create policy "weekly_technician_statements_delete_admin" on public.weekly_technician_statements for delete
  using (public.is_admin() and company_id = public.my_company_id());

drop trigger if exists set_weekly_technician_statements_updated_at on public.weekly_technician_statements;
create trigger set_weekly_technician_statements_updated_at before update on public.weekly_technician_statements
  for each row execute function public.handle_updated_at();

-- ── 8. Payroll Runs (replaces payroll_registers) — W-2, with configurable
--       withholding lines carried per-line at build time. ───────────────────
drop table if exists public.payroll_registers cascade;
create table if not exists public.payroll_runs (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  number         text not null default '',
  period_start   date not null,
  period_end     date not null,
  pay_date       date not null,
  frequency      text not null default 'weekly' check (frequency in ('weekly','biweekly')),
  status         text not null default 'draft' check (status in ('draft','approved','paid')),
  lines          jsonb not null default '[]'::jsonb,
  approval       jsonb,
  paid_at        timestamptz,
  audit          jsonb not null default '[]'::jsonb,
  pdf_history    jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.payroll_runs enable row level security;

-- Same admin/accountant-only posture as before (migration 032) — payroll
-- carries wage data, never a company-wide read.
create policy "payroll_runs_select" on public.payroll_runs for select
  using (
    company_id = public.my_company_id()
    and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','accountant'))
  );
create policy "payroll_runs_insert_admin" on public.payroll_runs for insert
  with check (public.is_admin() and company_id = public.my_company_id());
create policy "payroll_runs_update_admin" on public.payroll_runs for update
  using (public.is_admin() and company_id = public.my_company_id());
create policy "payroll_runs_delete_admin" on public.payroll_runs for delete
  using (public.is_admin() and company_id = public.my_company_id());

drop trigger if exists set_payroll_runs_updated_at on public.payroll_runs;
create trigger set_payroll_runs_updated_at before update on public.payroll_runs
  for each row execute function public.handle_updated_at();
