-- CompensaFlow Phase 6: Notifications
-- Depends on: 001–007

-- ============================================================
-- 1. NOTIFICATIONS
-- audience: 'admin' = visible to all admins
--           '<agent_id>' (uuid as text) = visible to that agent only
-- ============================================================
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  at          timestamptz not null default now(),
  kind        text not null check (kind in (
                'dispute_submitted','dispute_replied','dispute_status',
                'dispute_claimed','split_changed','pdf_regenerated','info'
              )),
  title       text not null,
  message     text not null default '',
  audience    text not null default 'admin',
  invoice_id  uuid references public.invoices(id) on delete set null,
  dispute_id  uuid references public.disputes(id) on delete set null,
  read        boolean not null default false,
  read_by     uuid references public.profiles(id) on delete set null
);

alter table public.notifications enable row level security;

-- Admins see notifications addressed to 'admin'
-- Agents see notifications addressed to their agent id
create policy "notifications_select"
  on public.notifications for select
  using (
    company_id = public.my_company_id()
    and (
      (audience = 'admin' and public.is_admin())
      or audience = public.my_agent_id()::text
    )
  );

-- Only admins and system (via RPCs) can insert notifications
create policy "notifications_insert_admin"
  on public.notifications for insert
  with check (public.is_admin() and company_id = public.my_company_id());

-- Anyone can mark their own notification as read
create policy "notifications_update_read"
  on public.notifications for update
  using (
    company_id = public.my_company_id()
    and (
      (audience = 'admin' and public.is_admin())
      or audience = public.my_agent_id()::text
    )
  );

-- ============================================================
-- 2. ENABLE REALTIME for notifications
--    Supabase Realtime lets the bell update live across tabs/users.
-- ============================================================
alter publication supabase_realtime add table public.notifications;

-- ============================================================
-- 3. HELPER: create_notification RPC
--    Used by dispute RPCs and other server-side operations.
-- ============================================================
create or replace function public.create_notification(
  p_company_id  uuid,
  p_kind        text,
  p_title       text,
  p_message     text,
  p_audience    text,
  p_invoice_id  uuid default null,
  p_dispute_id  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (
    company_id, kind, title, message, audience, invoice_id, dispute_id
  )
  values (
    p_company_id, p_kind, p_title, p_message, p_audience, p_invoice_id, p_dispute_id
  )
  returning id into v_id;

  return v_id;
end;
$$;
