-- PayClarity Phase 7: Superadmin / SaaS Multi-tenant Support
-- Depends on: 001–008
-- Run in Supabase SQL Editor AFTER previous migrations.

-- ============================================================
-- 1. SUPERADMIN ROLE
-- ============================================================

-- Allow 'superadmin' as a valid role value in profiles
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'rep', 'accountant', 'superadmin'));

-- Superadmin status: always treated as active regardless of status field
-- (keep status column as-is; auth guard checks role = 'superadmin' as bypass)

-- ============================================================
-- 2. ENRICH companies TABLE FOR SAAS
-- ============================================================

alter table public.companies
  add column if not exists invite_code  text,
  add column if not exists status       text not null default 'active'
    check (status in ('active', 'trial', 'suspended')),
  add column if not exists plan         text not null default 'starter';

-- Backfill invite_code from company_config for existing companies
update public.companies c
set invite_code = cc.invite_code
from public.company_config cc
where cc.company_id = c.id
  and c.invite_code is null;

-- ============================================================
-- 3. HELPER: is_superadmin()
-- ============================================================

create or replace function public.is_superadmin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'superadmin'
  );
$$;

-- ============================================================
-- 4. RLS BYPASS FOR SUPERADMIN (all major tables)
-- ============================================================

-- companies
create policy "companies_all_superadmin"
  on public.companies for all
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- profiles
create policy "profiles_all_superadmin"
  on public.profiles for all
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- company_config
create policy "company_config_all_superadmin"
  on public.company_config for all
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- agents
create policy "agents_all_superadmin"
  on public.agents for all
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- invoices
create policy "invoices_all_superadmin"
  on public.invoices for all
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- payments
create policy "payments_all_superadmin"
  on public.payments for all
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- ============================================================
-- 5. UPDATE verify_invite_code → also checks companies.invite_code
-- ============================================================

create or replace function public.verify_invite_code(code text)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    -- legacy: check company_config.invite_code (old path)
    (select cc.company_id
     from public.company_config cc
     where cc.invite_code = code
     limit 1),
    -- new: check companies.invite_code directly
    (select c.id
     from public.companies c
     where c.invite_code = code
       and c.status = 'active'
     limit 1)
  );
$$;

-- ============================================================
-- 6. SUPERADMIN: create_company_with_invite RPC
--    Creates a new company + invite code atomically.
--    Returns: { company_id, invite_code }
-- ============================================================

create or replace function public.create_company_with_invite(
  p_name        text,
  p_invite_code text default null,
  p_plan        text default 'starter'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id  uuid;
  v_code        text;
begin
  if not public.is_superadmin() then
    raise exception 'Access denied: superadmin only';
  end if;

  -- Generate code if not provided (8 uppercase alphanumeric chars)
  v_code := coalesce(
    nullif(trim(p_invite_code), ''),
    upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8))
  );

  insert into public.companies (name, plan, invite_code)
  values (p_name, p_plan, v_code)
  returning id into v_company_id;

  -- Also insert into company_config for backward compat
  insert into public.company_config (company_id, invite_code)
  values (v_company_id, v_code)
  on conflict do nothing;

  return json_build_object(
    'company_id',  v_company_id,
    'invite_code', v_code
  );
end;
$$;

-- ============================================================
-- 7. SUPERADMIN: regenerate_invite_code RPC
-- ============================================================

create or replace function public.regenerate_invite_code(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not public.is_superadmin() then
    raise exception 'Access denied: superadmin only';
  end if;

  v_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));

  update public.companies set invite_code = v_code where id = p_company_id;
  update public.company_config set invite_code = v_code where company_id = p_company_id;

  return v_code;
end;
$$;

-- ============================================================
-- 8. SUPERADMIN: set_company_status RPC
-- ============================================================

create or replace function public.set_company_status(
  p_company_id uuid,
  p_status     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Access denied: superadmin only';
  end if;

  update public.companies
  set status = p_status
  where id = p_company_id;
end;
$$;

-- ============================================================
-- 9. VIEW: superadmin_companies_summary
--    Superadmin sees each company with user + agent counts.
-- ============================================================

create or replace view public.superadmin_companies_summary
with (security_invoker = true)
as
select
  c.id,
  c.name,
  c.status,
  c.plan,
  c.invite_code,
  c.created_at,
  count(distinct p.id)  filter (where p.role != 'superadmin' or p.role is null) as user_count,
  count(distinct p.id)  filter (where p.status = 'active' and (p.role != 'superadmin' or p.role is null)) as active_user_count,
  count(distinct a.id)  as agent_count
from public.companies c
left join public.profiles p on p.company_id = c.id
left join public.agents   a on a.company_id = c.id
group by c.id, c.name, c.status, c.plan, c.invite_code, c.created_at
order by c.created_at desc;

-- Superadmin can read the view (RLS on base tables apply via security_invoker)
grant select on public.superadmin_companies_summary to authenticated;
