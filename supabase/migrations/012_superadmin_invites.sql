-- Migration 012: Superadmin invite & approval flow
-- Allows existing superadmins to generate one-time invite links.
-- New superadmin accounts start as pending and must be approved.

-- ── 1. Invite tokens table ────────────────────────────────────────────────────
create table if not exists public.superadmin_invites (
  id         uuid primary key default gen_random_uuid(),
  token      text unique not null default encode(gen_random_bytes(24), 'hex'),
  created_by uuid references auth.users(id) on delete set null,
  used_by    uuid references auth.users(id) on delete set null,
  status     text not null default 'pending'
               check (status in ('pending', 'used', 'revoked')),
  created_at timestamptz not null default now(),
  used_at    timestamptz
);

alter table public.superadmin_invites enable row level security;

-- Only active superadmins can read/manage invites
create policy "superadmin_invites_all"
  on public.superadmin_invites
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- ── 2. Update auth guard: require status=active for superadmin ────────────────
-- The handle_new_user trigger is NOT changed here — new users via invite
-- start as role=null/status=pending; consume_superadmin_invite() promotes them.

-- ── 3. RPC: verify invite token (public — called before sign-up) ──────────────
create or replace function public.verify_superadmin_invite(p_token text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(
    select 1 from public.superadmin_invites
    where token = p_token and status = 'pending'
  );
$$;

-- ── 4. RPC: generate invite (superadmin only) ─────────────────────────────────
create or replace function public.create_superadmin_invite()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not public.is_superadmin() then
    raise exception 'Unauthorized';
  end if;

  insert into public.superadmin_invites (created_by)
  values (auth.uid())
  returning token into v_token;

  return v_token;
end;
$$;

-- ── 5. RPC: consume invite after sign-up (called by new user) ────────────────
-- Sets caller's profile to role=superadmin / status=pending.
-- The existing superadmin then approves (sets status=active) from the panel.
create or replace function public.consume_superadmin_invite(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists(
    select 1 from public.superadmin_invites
    where token = p_token and status = 'pending'
  ) then
    raise exception 'Invite token inválido o ya utilizado';
  end if;

  -- Mark invite consumed
  update public.superadmin_invites
  set status = 'used', used_by = auth.uid(), used_at = now()
  where token = p_token;

  -- Promote caller to pending superadmin (no company)
  update public.profiles
  set role = 'superadmin', status = 'pending', company_id = null
  where id = auth.uid();
end;
$$;

-- ── 6. RPC: revoke invite ─────────────────────────────────────────────────────
create or replace function public.revoke_superadmin_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Unauthorized';
  end if;

  update public.superadmin_invites
  set status = 'revoked'
  where id = p_invite_id and status = 'pending';
end;
$$;
