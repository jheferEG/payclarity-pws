-- CompensaFlow Phase 2: Catalog Tables
-- Depends on: 001_auth_setup.sql, 002_companies.sql

-- ============================================================
-- 1. FINANCE COMPANIES
-- ============================================================
create table if not exists public.finance_companies (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references public.companies(id) on delete cascade,
  name                    text not null,
  default_fee             numeric(8,6) not null default 0,
  dealer_fee              numeric(14,2) not null default 0,
  admin_fee               numeric(14,2) not null default 0,
  uses_approval_discount  boolean not null default true,
  active                  boolean not null default true,
  notes                   text not null default '',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.finance_companies enable row level security;

create policy "finance_companies_select"
  on public.finance_companies for select
  using (company_id = public.my_company_id());

create policy "finance_companies_insert_admin"
  on public.finance_companies for insert
  with check (public.is_admin() and company_id = public.my_company_id());

create policy "finance_companies_update_admin"
  on public.finance_companies for update
  using (public.is_admin() and company_id = public.my_company_id());

create policy "finance_companies_delete_admin"
  on public.finance_companies for delete
  using (public.is_admin() and company_id = public.my_company_id());

drop trigger if exists set_finance_companies_updated_at on public.finance_companies;
create trigger set_finance_companies_updated_at
  before update on public.finance_companies
  for each row execute function public.handle_updated_at();

-- ============================================================
-- 2. PRODUCTS
-- ============================================================
create table if not exists public.products (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  name           text not null,
  sku            text not null default '',
  kind           text not null default 'product' check (kind in ('product','service','plan')),
  price          numeric(14,2) not null default 0,
  cost           numeric(14,2) not null default 0,
  price_editable boolean not null default true,
  active         boolean not null default true,
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.products enable row level security;

create policy "products_select"
  on public.products for select
  using (company_id = public.my_company_id());

create policy "products_insert_admin"
  on public.products for insert
  with check (public.is_admin() and company_id = public.my_company_id());

create policy "products_update_admin"
  on public.products for update
  using (public.is_admin() and company_id = public.my_company_id());

create policy "products_delete_admin"
  on public.products for delete
  using (public.is_admin() and company_id = public.my_company_id());

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
  before update on public.products
  for each row execute function public.handle_updated_at();

-- ============================================================
-- 3. COMPENSATION POSITIONS
-- ============================================================
create table if not exists public.compensation_positions (
  id                           uuid primary key default gen_random_uuid(),
  company_id                   uuid not null references public.companies(id) on delete cascade,
  name                         text not null,
  commission_percent           numeric(8,6) not null default 0,
  fixed_payout                 numeric(14,2) not null default 0,
  override_eligible            boolean not null default false,
  differential_override_percent numeric(8,6) not null default 0,
  split_default_percent        numeric(8,6) not null default 0.5,
  effective_from               date not null,
  effective_to                 date,
  active                       boolean not null default true,
  finance_company_id           uuid references public.finance_companies(id) on delete set null,
  product_rule                 text not null default '',
  min_approval_percent         numeric(8,6) not null default 0,
  special_deduction_percent    numeric(8,6) not null default 0,
  notes                        text not null default '',
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

alter table public.compensation_positions enable row level security;

create policy "positions_select"
  on public.compensation_positions for select
  using (company_id = public.my_company_id());

create policy "positions_insert_admin"
  on public.compensation_positions for insert
  with check (public.is_admin() and company_id = public.my_company_id());

create policy "positions_update_admin"
  on public.compensation_positions for update
  using (public.is_admin() and company_id = public.my_company_id());

create policy "positions_delete_admin"
  on public.compensation_positions for delete
  using (public.is_admin() and company_id = public.my_company_id());

drop trigger if exists set_positions_updated_at on public.compensation_positions;
create trigger set_positions_updated_at
  before update on public.compensation_positions
  for each row execute function public.handle_updated_at();

-- ============================================================
-- 4. COMMISSION TIERS  (replaces personalTiers[] on the store)
-- ============================================================
create table if not exists public.commission_tiers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  min_volume  numeric(14,2) not null,
  rate        numeric(8,6) not null,
  sort_order  integer not null default 0,
  unique (company_id, min_volume)
);

alter table public.commission_tiers enable row level security;

create policy "tiers_select"
  on public.commission_tiers for select
  using (company_id = public.my_company_id());

create policy "tiers_insert_admin"
  on public.commission_tiers for insert
  with check (public.is_admin() and company_id = public.my_company_id());

create policy "tiers_update_admin"
  on public.commission_tiers for update
  using (public.is_admin() and company_id = public.my_company_id());

create policy "tiers_delete_admin"
  on public.commission_tiers for delete
  using (public.is_admin() and company_id = public.my_company_id());

-- ============================================================
-- 5. OVERRIDE LEVELS  (replaces overrides[] on the store)
-- ============================================================
create table if not exists public.override_levels (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  level       integer not null,
  rate        numeric(8,6) not null,
  unique (company_id, level)
);

alter table public.override_levels enable row level security;

create policy "override_levels_select"
  on public.override_levels for select
  using (company_id = public.my_company_id());

create policy "override_levels_insert_admin"
  on public.override_levels for insert
  with check (public.is_admin() and company_id = public.my_company_id());

create policy "override_levels_update_admin"
  on public.override_levels for update
  using (public.is_admin() and company_id = public.my_company_id());

create policy "override_levels_delete_admin"
  on public.override_levels for delete
  using (public.is_admin() and company_id = public.my_company_id());

-- ============================================================
-- 6. TAX RESERVE BY STATE  (replaces taxReserveByState record)
-- ============================================================
create table if not exists public.tax_reserve_by_state (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  state_code  text not null,
  rate        numeric(8,6) not null,
  unique (company_id, state_code)
);

alter table public.tax_reserve_by_state enable row level security;

create policy "tax_reserve_select"
  on public.tax_reserve_by_state for select
  using (company_id = public.my_company_id());

create policy "tax_reserve_insert_admin"
  on public.tax_reserve_by_state for insert
  with check (public.is_admin() and company_id = public.my_company_id());

create policy "tax_reserve_update_admin"
  on public.tax_reserve_by_state for update
  using (public.is_admin() and company_id = public.my_company_id());

create policy "tax_reserve_delete_admin"
  on public.tax_reserve_by_state for delete
  using (public.is_admin() and company_id = public.my_company_id());
