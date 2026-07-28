-- CompensaFlow Phase 4b: Splits
-- Depends on: 001–005

-- ============================================================
-- 1. SPLIT TEMPLATES
-- ============================================================
create table if not exists public.split_templates (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  description text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.split_templates enable row level security;

create policy "split_templates_select"
  on public.split_templates for select
  using (company_id = public.my_company_id());

create policy "split_templates_insert_admin"
  on public.split_templates for insert
  with check (public.is_admin() and company_id = public.my_company_id());

create policy "split_templates_update_admin"
  on public.split_templates for update
  using (public.is_admin() and company_id = public.my_company_id());

create policy "split_templates_delete_admin"
  on public.split_templates for delete
  using (public.is_admin() and company_id = public.my_company_id());

drop trigger if exists set_split_templates_updated_at on public.split_templates;
create trigger set_split_templates_updated_at
  before update on public.split_templates
  for each row execute function public.handle_updated_at();

-- ============================================================
-- 2. SPLIT TEMPLATE POSITIONS
-- ============================================================
create table if not exists public.split_template_positions (
  id                uuid primary key default gen_random_uuid(),
  template_id       uuid not null references public.split_templates(id) on delete cascade,
  role              text not null,
  custom_role_label text,
  split_percent     numeric(8,6) not null,
  display_name      text,
  sort_order        integer not null default 0
);

alter table public.split_template_positions enable row level security;

create policy "split_template_positions_select"
  on public.split_template_positions for select
  using (
    template_id in (
      select id from public.split_templates where company_id = public.my_company_id()
    )
  );

create policy "split_template_positions_insert_admin"
  on public.split_template_positions for insert
  with check (
    public.is_admin() and
    template_id in (
      select id from public.split_templates where company_id = public.my_company_id()
    )
  );

create policy "split_template_positions_update_admin"
  on public.split_template_positions for update
  using (
    public.is_admin() and
    template_id in (
      select id from public.split_templates where company_id = public.my_company_id()
    )
  );

create policy "split_template_positions_delete_admin"
  on public.split_template_positions for delete
  using (
    public.is_admin() and
    template_id in (
      select id from public.split_templates where company_id = public.my_company_id()
    )
  );

-- ============================================================
-- 3. SPLIT RULES
-- ============================================================
create table if not exists public.split_rules (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  priority    integer not null default 0,
  active      boolean not null default true,
  template_id uuid not null references public.split_templates(id) on delete cascade,
  criteria    jsonb not null default '{}',
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.split_rules enable row level security;

create policy "split_rules_select"
  on public.split_rules for select
  using (company_id = public.my_company_id());

create policy "split_rules_insert_admin"
  on public.split_rules for insert
  with check (public.is_admin() and company_id = public.my_company_id());

create policy "split_rules_update_admin"
  on public.split_rules for update
  using (public.is_admin() and company_id = public.my_company_id());

create policy "split_rules_delete_admin"
  on public.split_rules for delete
  using (public.is_admin() and company_id = public.my_company_id());

drop trigger if exists set_split_rules_updated_at on public.split_rules;
create trigger set_split_rules_updated_at
  before update on public.split_rules
  for each row execute function public.handle_updated_at();

-- ============================================================
-- 4. INVOICE SPLITS  (one per invoice)
-- ============================================================
create table if not exists public.invoice_splits (
  id                  uuid primary key default gen_random_uuid(),
  invoice_id          uuid not null unique references public.invoices(id) on delete cascade,
  applied_rule_id     uuid references public.split_rules(id) on delete set null,
  applied_template_id uuid references public.split_templates(id) on delete set null,
  approved_at         timestamptz,
  approved_by         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.invoice_splits enable row level security;

create policy "invoice_splits_select"
  on public.invoice_splits for select
  using (
    invoice_id in (
      select id from public.invoices where company_id = public.my_company_id()
    )
  );

create policy "invoice_splits_insert_admin"
  on public.invoice_splits for insert
  with check (
    public.is_admin() and
    invoice_id in (
      select id from public.invoices where company_id = public.my_company_id()
    )
  );

create policy "invoice_splits_update_admin"
  on public.invoice_splits for update
  using (
    public.is_admin() and
    invoice_id in (
      select id from public.invoices where company_id = public.my_company_id()
    )
  );

drop trigger if exists set_invoice_splits_updated_at on public.invoice_splits;
create trigger set_invoice_splits_updated_at
  before update on public.invoice_splits
  for each row execute function public.handle_updated_at();

-- ============================================================
-- 5. INVOICE SPLIT PARTICIPANTS
-- ============================================================
create table if not exists public.invoice_split_participants (
  id               uuid primary key default gen_random_uuid(),
  invoice_split_id uuid not null references public.invoice_splits(id) on delete cascade,
  agent_id         uuid references public.agents(id) on delete set null,
  display_name     text not null default '',
  role             text not null,
  custom_role_label text,
  split_percent    numeric(8,6) not null,
  commission_level text,
  notes            text,
  sort_order       integer not null default 0
);

alter table public.invoice_split_participants enable row level security;

create policy "split_participants_select"
  on public.invoice_split_participants for select
  using (
    invoice_split_id in (
      select s.id from public.invoice_splits s
      join public.invoices i on i.id = s.invoice_id
      where i.company_id = public.my_company_id()
    )
  );

create policy "split_participants_insert_admin"
  on public.invoice_split_participants for insert
  with check (
    public.is_admin() and
    invoice_split_id in (
      select s.id from public.invoice_splits s
      join public.invoices i on i.id = s.invoice_id
      where i.company_id = public.my_company_id()
    )
  );

create policy "split_participants_update_admin"
  on public.invoice_split_participants for update
  using (
    public.is_admin() and
    invoice_split_id in (
      select s.id from public.invoice_splits s
      join public.invoices i on i.id = s.invoice_id
      where i.company_id = public.my_company_id()
    )
  );

create policy "split_participants_delete_admin"
  on public.invoice_split_participants for delete
  using (
    public.is_admin() and
    invoice_split_id in (
      select s.id from public.invoice_splits s
      join public.invoices i on i.id = s.invoice_id
      where i.company_id = public.my_company_id()
    )
  );

-- ============================================================
-- 6. SPLIT AUDIT ENTRIES
-- ============================================================
create table if not exists public.split_audit_entries (
  id               uuid primary key default gen_random_uuid(),
  invoice_split_id uuid not null references public.invoice_splits(id) on delete cascade,
  at               timestamptz not null default now(),
  by               text not null,
  action           text not null
                     check (action in ('created','updated','rule_applied','template_applied','cleared','approved','recalculated')),
  message          text not null default '',
  snapshot         jsonb not null default '[]'
);

alter table public.split_audit_entries enable row level security;

create policy "split_audit_select"
  on public.split_audit_entries for select
  using (
    invoice_split_id in (
      select s.id from public.invoice_splits s
      join public.invoices i on i.id = s.invoice_id
      where i.company_id = public.my_company_id()
    )
  );

create policy "split_audit_insert_admin"
  on public.split_audit_entries for insert
  with check (
    public.is_admin() and
    invoice_split_id in (
      select s.id from public.invoice_splits s
      join public.invoices i on i.id = s.invoice_id
      where i.company_id = public.my_company_id()
    )
  );
