-- CompensaFlow Phase 1: Companies + Company Linkage
-- Run this in Supabase SQL Editor after 001_auth_setup.sql

-- ============================================================
-- 1. COMPANIES TABLE
-- ============================================================
create table if not exists public.companies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null default 'My Company',
  address         text not null default '',
  email           text not null default '',
  phone           text not null default '',
  tax_id          text not null default '',
  currency        text not null default 'USD',
  invoice_prefix  text not null default 'INV',
  brand_color     text not null default '#0B1F3A',
  brand_color_secondary text not null default '#2563EB',
  logo_data_url   text not null default '',
  footer_text     text not null default '',
  disclaimer_text text not null default '',
  invoice_template text not null default 'classic',
  invoice_date    date,
  period_label    text not null default '',
  next_payout_date date,
  language        text not null default 'en',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.companies enable row level security;

-- ============================================================
-- 2. LINK company_config → companies
-- ============================================================
alter table public.company_config
  add column if not exists company_id uuid references public.companies(id);

-- ============================================================
-- 3. LINK profiles → companies
-- ============================================================
alter table public.profiles
  add column if not exists company_id uuid references public.companies(id);

-- ============================================================
-- 4. SEED: create default company + backfill existing data
-- ============================================================
do $$
declare
  v_company_id uuid;
begin
  -- Only seed if company_config has no company linked yet
  if (select company_id from public.company_config where id = 1) is null then
    insert into public.companies (name)
    values ('My Company')
    returning id into v_company_id;

    update public.company_config
    set company_id = v_company_id
    where id = 1;

    -- Backfill any existing profiles
    update public.profiles
    set company_id = v_company_id
    where company_id is null;
  end if;
end;
$$;

-- ============================================================
-- 5. HELPER FUNCTIONS
-- ============================================================

-- Returns the company_id of the currently authenticated user
create or replace function public.my_company_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

-- Placeholder: replaced in 004_agents.sql when agents table exists
create or replace function public.my_agent_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select null::uuid;
$$;

-- ============================================================
-- 6. RLS POLICIES FOR companies
-- ============================================================

-- Members can read their own company
create policy "companies_select_member"
  on public.companies for select
  using (id = public.my_company_id());

-- Admins can update their company settings
create policy "companies_update_admin"
  on public.companies for update
  using (public.is_admin());

-- ============================================================
-- 7. UPDATE verify_invite_code → returns company_id (uuid)
--    Previously returned boolean; now returns the uuid of the
--    matching company so the register flow can link the profile.
-- ============================================================
drop function if exists public.verify_invite_code(text);

create or replace function public.verify_invite_code(code text)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select cc.company_id
  from public.company_config cc
  where cc.invite_code = code;
$$;

-- ============================================================
-- 8. UPDATE handle_new_user → sets company_id from metadata
--    The register page passes company_id in options.data after
--    calling verify_invite_code, so the trigger picks it up.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, status, company_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    null,
    'pending',
    case
      when new.raw_user_meta_data->>'company_id' is not null
        then (new.raw_user_meta_data->>'company_id')::uuid
      else (select company_id from public.company_config where id = 1)
    end
  );

  return new;
end;
$$;

-- ============================================================
-- 9. updated_at TRIGGER FOR companies
-- ============================================================
drop trigger if exists set_companies_updated_at on public.companies;
create trigger set_companies_updated_at
  before update on public.companies
  for each row execute function public.handle_updated_at();
