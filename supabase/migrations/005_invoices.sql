-- CompensaFlow Phase 4a: Invoices
-- Depends on: 001–004

-- ============================================================
-- 1. INVOICE SEQUENCE  (concurrent-safe number generation)
-- ============================================================
create table if not exists public.invoice_sequences (
  company_id  uuid primary key references public.companies(id) on delete cascade,
  last_seq    integer not null default 0
);

-- Seed a row for the existing company
insert into public.invoice_sequences (company_id, last_seq)
select id, 0 from public.companies
on conflict (company_id) do nothing;

-- ============================================================
-- 2. INVOICES
-- ============================================================
create table if not exists public.invoices (
  id                         uuid primary key default gen_random_uuid(),
  company_id                 uuid not null references public.companies(id) on delete cascade,
  number                     text not null,
  date                       date not null,
  status                     text not null default 'draft'
                               check (status in ('draft','pending','paid','on_hold')),
  agent_id                   uuid not null references public.agents(id),
  finance_company_id         uuid references public.finance_companies(id) on delete set null,
  customer_name              text not null default '',
  customer_notes             text not null default '',
  sales_amount               numeric(14,2) not null default 0,
  product_cost               numeric(14,2) not null default 0,
  approval_percent           numeric(8,6) not null default 1,
  discount                   numeric(14,2) not null default 0,
  advance_applied            numeric(14,2) not null default 0,
  special_deductions         numeric(14,2) not null default 0,
  tax_reserve_percent        numeric(8,6) not null default 0,
  paid                       boolean not null default false,
  sale_type                  text check (sale_type in ('credit_card','finance','check','wire','cash')),
  ccpf_percent               numeric(8,6) not null default 0.035,
  admin_fee_percent          numeric(8,6) not null default 0,
  dealer_fee                 numeric(14,2),
  approved_advance_amount    numeric(14,2) not null default 0,
  pending_advance_balance    numeric(14,2) not null default 0,
  commission_level           text not null default '',
  commission_base            text not null default 'profit'
                               check (commission_base in ('profit','product_cost')),
  commission_percent_override numeric(8,6),
  branding_snapshot          jsonb,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (company_id, number)
);

alter table public.invoices enable row level security;

-- All company members can read invoices
create policy "invoices_select"
  on public.invoices for select
  using (company_id = public.my_company_id());

-- Admins can do everything
create policy "invoices_insert_admin"
  on public.invoices for insert
  with check (public.is_admin() and company_id = public.my_company_id());

create policy "invoices_update_admin"
  on public.invoices for update
  using (public.is_admin() and company_id = public.my_company_id());

create policy "invoices_delete_admin"
  on public.invoices for delete
  using (public.is_admin() and company_id = public.my_company_id());

-- Reps can insert invoices for themselves
create policy "invoices_insert_rep"
  on public.invoices for insert
  with check (
    company_id = public.my_company_id()
    and agent_id = public.my_agent_id()
  );

drop trigger if exists set_invoices_updated_at on public.invoices;
create trigger set_invoices_updated_at
  before update on public.invoices
  for each row execute function public.handle_updated_at();

-- ============================================================
-- 3. INVOICE LINE ITEMS  (replaces charges[] / credits[] arrays)
-- ============================================================
create table if not exists public.invoice_line_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  kind        text not null check (kind in ('charge','credit')),
  label       text not null default '',
  amount      numeric(14,2) not null default 0,
  sort_order  integer not null default 0
);

alter table public.invoice_line_items enable row level security;

create policy "line_items_select"
  on public.invoice_line_items for select
  using (
    invoice_id in (
      select id from public.invoices where company_id = public.my_company_id()
    )
  );

create policy "line_items_insert_admin"
  on public.invoice_line_items for insert
  with check (
    public.is_admin() and
    invoice_id in (
      select id from public.invoices where company_id = public.my_company_id()
    )
  );

create policy "line_items_update_admin"
  on public.invoice_line_items for update
  using (
    public.is_admin() and
    invoice_id in (
      select id from public.invoices where company_id = public.my_company_id()
    )
  );

create policy "line_items_delete_admin"
  on public.invoice_line_items for delete
  using (
    public.is_admin() and
    invoice_id in (
      select id from public.invoices where company_id = public.my_company_id()
    )
  );

-- ============================================================
-- 4. PDF HISTORY
-- ============================================================
create table if not exists public.invoice_pdf_records (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references public.invoices(id) on delete cascade,
  at                timestamptz not null default now(),
  by                text not null,
  reason            text not null
                      check (reason in ('initial','split_changed','manual_regeneration','approval')),
  file_name         text not null,
  split_snapshot    jsonb,
  branding_snapshot jsonb not null default '{}'
);

alter table public.invoice_pdf_records enable row level security;

create policy "pdf_records_select"
  on public.invoice_pdf_records for select
  using (
    invoice_id in (
      select id from public.invoices where company_id = public.my_company_id()
    )
  );

create policy "pdf_records_insert_admin"
  on public.invoice_pdf_records for insert
  with check (
    public.is_admin() and
    invoice_id in (
      select id from public.invoices where company_id = public.my_company_id()
    )
  );

-- ============================================================
-- 5. RPC: next_invoice_number — atomic, concurrent-safe
-- ============================================================
create or replace function public.next_invoice_number(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq     integer;
  v_prefix  text;
begin
  update public.invoice_sequences
  set last_seq = last_seq + 1
  where company_id = p_company_id
  returning last_seq into v_seq;

  select invoice_prefix into v_prefix
  from public.companies
  where id = p_company_id;

  return v_prefix || '-' || lpad(v_seq::text, 5, '0');
end;
$$;

-- ============================================================
-- 6. RPC: create_invoice — inserts invoice + line items atomically
-- ============================================================
create or replace function public.create_invoice(p_invoice jsonb, p_line_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id  uuid;
  v_invoice_id  uuid;
  v_number      text;
begin
  v_company_id := (p_invoice->>'company_id')::uuid;

  -- Verify caller belongs to this company
  if v_company_id is distinct from public.my_company_id() then
    raise exception 'Unauthorized';
  end if;

  -- Generate number if not provided
  if p_invoice->>'number' is null or p_invoice->>'number' = '' then
    v_number := public.next_invoice_number(v_company_id);
  else
    v_number := p_invoice->>'number';
  end if;

  insert into public.invoices (
    company_id, number, date, status, agent_id, finance_company_id,
    customer_name, customer_notes, sales_amount, product_cost,
    approval_percent, discount, advance_applied, special_deductions,
    tax_reserve_percent, paid, sale_type, ccpf_percent, admin_fee_percent,
    dealer_fee, approved_advance_amount, pending_advance_balance,
    commission_level, commission_base, commission_percent_override, branding_snapshot
  )
  values (
    v_company_id,
    v_number,
    (p_invoice->>'date')::date,
    coalesce(p_invoice->>'status', 'draft'),
    (p_invoice->>'agent_id')::uuid,
    nullif(p_invoice->>'finance_company_id', '')::uuid,
    coalesce(p_invoice->>'customer_name', ''),
    coalesce(p_invoice->>'customer_notes', ''),
    coalesce((p_invoice->>'sales_amount')::numeric, 0),
    coalesce((p_invoice->>'product_cost')::numeric, 0),
    coalesce((p_invoice->>'approval_percent')::numeric, 1),
    coalesce((p_invoice->>'discount')::numeric, 0),
    coalesce((p_invoice->>'advance_applied')::numeric, 0),
    coalesce((p_invoice->>'special_deductions')::numeric, 0),
    coalesce((p_invoice->>'tax_reserve_percent')::numeric, 0),
    coalesce((p_invoice->>'paid')::boolean, false),
    nullif(p_invoice->>'sale_type', ''),
    coalesce((p_invoice->>'ccpf_percent')::numeric, 0.035),
    coalesce((p_invoice->>'admin_fee_percent')::numeric, 0),
    nullif(p_invoice->>'dealer_fee', '')::numeric,
    coalesce((p_invoice->>'approved_advance_amount')::numeric, 0),
    coalesce((p_invoice->>'pending_advance_balance')::numeric, 0),
    coalesce(p_invoice->>'commission_level', ''),
    coalesce(p_invoice->>'commission_base', 'profit'),
    nullif(p_invoice->>'commission_percent_override', '')::numeric,
    p_invoice->'branding_snapshot'
  )
  returning id into v_invoice_id;

  -- Insert line items
  if p_line_items is not null and jsonb_array_length(p_line_items) > 0 then
    insert into public.invoice_line_items (invoice_id, kind, label, amount, sort_order)
    select
      v_invoice_id,
      item->>'kind',
      coalesce(item->>'label', ''),
      coalesce((item->>'amount')::numeric, 0),
      coalesce((item->>'sort_order')::integer, 0)
    from jsonb_array_elements(p_line_items) as item;
  end if;

  return v_invoice_id;
end;
$$;
