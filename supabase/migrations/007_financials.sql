-- CompensaFlow Phase 5: Payments, Adjustments, Disputes
-- Depends on: 001–006

-- ============================================================
-- 1. PAYMENTS
-- ============================================================
create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  agent_id    uuid not null references public.agents(id),
  date        date not null,
  amount      numeric(14,2) not null,
  method      text not null default '',
  notes       text not null default '',
  reference   text not null default '',
  created_at  timestamptz not null default now()
);

alter table public.payments enable row level security;

create policy "payments_select"
  on public.payments for select
  using (company_id = public.my_company_id());

create policy "payments_insert_admin"
  on public.payments for insert
  with check (public.is_admin() and company_id = public.my_company_id());

create policy "payments_delete_admin"
  on public.payments for delete
  using (public.is_admin() and company_id = public.my_company_id());

-- ============================================================
-- 2. ADJUSTMENTS
-- ============================================================
create table if not exists public.adjustments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  agent_id    uuid not null references public.agents(id),
  invoice_id  uuid references public.invoices(id) on delete set null,
  kind        text not null check (kind in (
                'advance','deduction','credit','chargeback',
                'manual_override','payment_correction','split_correction','pending_balance'
              )),
  amount      numeric(14,2) not null,
  date        date not null,
  note        text not null default '',
  created_by  text not null default '',
  created_at  timestamptz not null default now()
);

alter table public.adjustments enable row level security;

create policy "adjustments_select"
  on public.adjustments for select
  using (company_id = public.my_company_id());

create policy "adjustments_insert_admin"
  on public.adjustments for insert
  with check (public.is_admin() and company_id = public.my_company_id());

create policy "adjustments_update_admin"
  on public.adjustments for update
  using (public.is_admin() and company_id = public.my_company_id());

create policy "adjustments_delete_admin"
  on public.adjustments for delete
  using (public.is_admin() and company_id = public.my_company_id());

-- ============================================================
-- 3. DISPUTES
-- ============================================================
create table if not exists public.disputes (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  invoice_id          uuid references public.invoices(id) on delete set null,
  agent_id            uuid not null references public.agents(id),
  reason              text not null,
  notes               text not null default '',
  kind                text not null default 'correction'
                        check (kind in ('correction','dispute','adjustment')),
  priority            text not null default 'normal'
                        check (priority in ('low','normal','high')),
  status              text not null default 'submitted'
                        check (status in ('submitted','under_review','needs_info','approved','rejected','resolved')),
  assigned_admin_id   uuid references public.agents(id) on delete set null,
  admin_notes         text not null default '',
  requested_change    jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  resolved_at         timestamptz
);

alter table public.disputes enable row level security;

-- All company members can read disputes
create policy "disputes_select"
  on public.disputes for select
  using (company_id = public.my_company_id());

-- Admins can do everything
create policy "disputes_insert_admin"
  on public.disputes for insert
  with check (public.is_admin() and company_id = public.my_company_id());

create policy "disputes_update_admin"
  on public.disputes for update
  using (public.is_admin() and company_id = public.my_company_id());

create policy "disputes_delete_admin"
  on public.disputes for delete
  using (public.is_admin() and company_id = public.my_company_id());

-- Reps can submit disputes for their own invoices
create policy "disputes_insert_rep"
  on public.disputes for insert
  with check (
    company_id = public.my_company_id()
    and agent_id = public.my_agent_id()
  );

drop trigger if exists set_disputes_updated_at on public.disputes;
create trigger set_disputes_updated_at
  before update on public.disputes
  for each row execute function public.handle_updated_at();

-- ============================================================
-- 4. DISPUTE EVENTS  (replaces events[] array on Dispute)
-- ============================================================
create table if not exists public.dispute_events (
  id          uuid primary key default gen_random_uuid(),
  dispute_id  uuid not null references public.disputes(id) on delete cascade,
  at          timestamptz not null default now(),
  actor       text not null check (actor in ('rep','admin','system')),
  type        text not null check (type in (
                'submitted','claimed','needs_info','rep_reply',
                'approved','rejected','resolved','note','reopened'
              )),
  message     text not null default ''
);

alter table public.dispute_events enable row level security;

create policy "dispute_events_select"
  on public.dispute_events for select
  using (
    dispute_id in (
      select id from public.disputes where company_id = public.my_company_id()
    )
  );

create policy "dispute_events_insert_admin"
  on public.dispute_events for insert
  with check (
    public.is_admin() and
    dispute_id in (
      select id from public.disputes where company_id = public.my_company_id()
    )
  );

-- Reps can append events to their own disputes
create policy "dispute_events_insert_rep"
  on public.dispute_events for insert
  with check (
    actor = 'rep' and
    dispute_id in (
      select id from public.disputes
      where company_id = public.my_company_id()
        and agent_id = public.my_agent_id()
    )
  );

-- ============================================================
-- 5. RPC: submit_dispute — creates dispute + initial event atomically
-- ============================================================
create or replace function public.submit_dispute(
  p_company_id        uuid,
  p_invoice_id        uuid,
  p_agent_id          uuid,
  p_reason            text,
  p_notes             text,
  p_kind              text,
  p_priority          text,
  p_requested_change  jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispute_id uuid;
begin
  if p_company_id is distinct from public.my_company_id() then
    raise exception 'Unauthorized';
  end if;

  insert into public.disputes (
    company_id, invoice_id, agent_id, reason, notes,
    kind, priority, status, requested_change
  )
  values (
    p_company_id, p_invoice_id, p_agent_id, p_reason, p_notes,
    p_kind, p_priority, 'submitted', p_requested_change
  )
  returning id into v_dispute_id;

  insert into public.dispute_events (dispute_id, actor, type, message)
  values (v_dispute_id, 'rep', 'submitted', p_reason);

  return v_dispute_id;
end;
$$;

-- ============================================================
-- 6. RPC: update_dispute_status — updates status + appends event
-- ============================================================
create or replace function public.update_dispute_status(
  p_dispute_id  uuid,
  p_status      text,
  p_actor       text,
  p_message     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Verify company membership
  if not exists (
    select 1 from public.disputes
    where id = p_dispute_id
      and company_id = public.my_company_id()
  ) then
    raise exception 'Unauthorized';
  end if;

  update public.disputes
  set
    status      = p_status,
    resolved_at = case when p_status in ('resolved','rejected') then now() else null end
  where id = p_dispute_id;

  insert into public.dispute_events (dispute_id, actor, type, message)
  values (p_dispute_id, p_actor, p_status::text, p_message);
end;
$$;
