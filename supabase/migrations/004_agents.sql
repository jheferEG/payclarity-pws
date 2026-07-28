-- CompensaFlow Phase 3: Agents
-- Depends on: 001_auth_setup.sql, 002_companies.sql

-- ============================================================
-- 1. AGENTS TABLE
-- ============================================================
create table if not exists public.agents (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  profile_id          uuid references public.profiles(id) on delete set null,
  name                text not null,
  email               text not null default '',
  sponsor_id          uuid references public.agents(id) on delete set null,
  w9_status           text not null default 'missing' check (w9_status in ('missing','pending','valid')),
  state               text not null default '',
  payment_method      text not null default '',
  tax_reserve_percent numeric(8,6) not null default 0,
  commission_percent  numeric(8,6),
  level               text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.agents enable row level security;

-- All members of the company can see all agents
create policy "agents_select"
  on public.agents for select
  using (company_id = public.my_company_id());

-- Only admins can create / update / delete agents
create policy "agents_insert_admin"
  on public.agents for insert
  with check (public.is_admin() and company_id = public.my_company_id());

create policy "agents_update_admin"
  on public.agents for update
  using (public.is_admin() and company_id = public.my_company_id());

create policy "agents_delete_admin"
  on public.agents for delete
  using (public.is_admin() and company_id = public.my_company_id());

drop trigger if exists set_agents_updated_at on public.agents;
create trigger set_agents_updated_at
  before update on public.agents
  for each row execute function public.handle_updated_at();

-- ============================================================
-- 2. REPLACE my_agent_id() placeholder (from 002_companies.sql)
--    Returns the agent row linked to the current auth user.
-- ============================================================
create or replace function public.my_agent_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id
  from public.agents
  where profile_id = auth.uid()
    and company_id = public.my_company_id()
  limit 1;
$$;

-- ============================================================
-- 3. AUTO-LINK: when an admin approves a user, find an agent
--    row with a matching email and set profile_id automatically.
-- ============================================================
create or replace function public.link_profile_to_agent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only run when status changes to 'active' and role is assigned
  if new.status = 'active' and new.role is not null
     and (old.status is distinct from 'active' or old.role is null) then
    update public.agents
    set profile_id = new.id
    where lower(email) = lower(new.email)
      and company_id  = new.company_id
      and profile_id  is null;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_activated on public.profiles;
create trigger on_profile_activated
  after update on public.profiles
  for each row execute function public.link_profile_to_agent();
