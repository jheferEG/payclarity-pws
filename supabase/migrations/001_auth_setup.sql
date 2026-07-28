-- CompensaFlow Auth Setup Migration
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query)

-- ============================================================
-- 1. PROFILES TABLE
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text check (role in ('admin', 'rep', 'accountant')),
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- ============================================================
-- 2. COMPANY CONFIG TABLE (single row, holds invite code)
-- ============================================================
create table if not exists public.company_config (
  id integer primary key default 1 check (id = 1),
  invite_code text not null default 'PAYCLARITY2024',
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.company_config (id, invite_code)
values (1, 'PAYCLARITY2024')
on conflict (id) do nothing;

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.company_config enable row level security;

-- Helper function: check if caller is an active admin
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'active'
  );
$$;

-- Profiles: user reads their own profile
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Profiles: admin reads all profiles
create policy "profiles_select_admin"
  on public.profiles for select
  using (public.is_admin());

-- Profiles: admin updates any profile (approve/reject/assign role)
create policy "profiles_update_admin"
  on public.profiles for update
  using (public.is_admin());

-- Profiles: anyone authenticated can insert their own (via signup trigger)
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Company config: authenticated users can read (to check code exists — RPC is safer)
create policy "company_config_select_authenticated"
  on public.company_config for select
  using (auth.role() = 'authenticated');

-- Company config: admin can update invite code
create policy "company_config_update_admin"
  on public.company_config for update
  using (public.is_admin());

-- ============================================================
-- 4. AUTO-CREATE PROFILE TRIGGER
-- All users start as pending with no role.
-- Admin assigns roles and approves from the database or User Management panel.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    null,
    'pending'
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 5. VERIFY INVITE CODE (never exposes the code to the client)
-- ============================================================
create or replace function public.verify_invite_code(code text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(
    select 1 from public.company_config
    where invite_code = code
  );
$$;

-- ============================================================
-- 6. AUTO-UPDATE updated_at
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

drop trigger if exists set_company_config_updated_at on public.company_config;
create trigger set_company_config_updated_at
  before update on public.company_config
  for each row execute function public.handle_updated_at();
