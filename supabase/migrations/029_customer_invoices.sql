-- Transpare: Customer Invoices — Phase 1 of "Billing & Technician Payables"
--
-- A customer-facing billing document, separate from the internal sales/
-- commission invoice. Linked to (but read-only against) the master
-- invoice via invoice_id — never writes sales_amount/product_cost/
-- commission fields, so it can never create a second commission or
-- double-count the sale. line_items and payments are stored as jsonb on
-- the same row, matching the precedent already set for
-- invoices.extras/invoices.customer_payments (028_cash_customer_invoice.sql).
-- Depends on: 001-028

create table if not exists public.customer_invoices (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  number             text not null default '',
  invoice_id         uuid not null references public.invoices(id) on delete cascade,
  status             text not null default 'draft'
                       check (status in ('draft','sent','viewed','partially_paid','paid','overdue','cancelled','refunded')),
  customer_name      text not null default '',
  customer_email     text not null default '',
  billing_address    text not null default '',
  service_address    text not null default '',
  invoice_date       date not null default current_date,
  due_date           date,
  line_items         jsonb not null default '[]'::jsonb,
  discount           numeric(14,2) not null default 0,
  tax_percent        numeric(8,6) not null default 0,
  deposit            numeric(14,2) not null default 0,
  financing_applied  numeric(14,2) not null default 0,
  payment_terms      text not null default '',
  notes              text not null default '',
  warranty_info      text not null default '',
  template_id        text,
  payments           jsonb not null default '[]'::jsonb,
  sent_at            timestamptz,
  viewed_at          timestamptz,
  branding_snapshot  jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.customer_invoices enable row level security;

-- All company members can read (reps may need to see what a customer was billed)
create policy "customer_invoices_select"
  on public.customer_invoices for select
  using (company_id = public.my_company_id());

-- Only admins manage billing documents
create policy "customer_invoices_insert_admin"
  on public.customer_invoices for insert
  with check (public.is_admin() and company_id = public.my_company_id());

create policy "customer_invoices_update_admin"
  on public.customer_invoices for update
  using (public.is_admin() and company_id = public.my_company_id());

create policy "customer_invoices_delete_admin"
  on public.customer_invoices for delete
  using (public.is_admin() and company_id = public.my_company_id());

drop trigger if exists set_customer_invoices_updated_at on public.customer_invoices;
create trigger set_customer_invoices_updated_at
  before update on public.customer_invoices
  for each row execute function public.handle_updated_at();
