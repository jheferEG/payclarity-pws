-- Transpare: Payout Documents
-- One private payout statement per (invoice, recipient) — the seller, each
-- override recipient, and each split participant on that sale. Previously
-- lived only in the browser's localStorage, so it was tied to one device/
-- domain; this makes it a durable, shared record like everything else.
-- Depends on: 001-021

create table if not exists public.payout_documents (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  number            text not null default '',
  invoice_id        uuid not null references public.invoices(id) on delete cascade,
  agent_id          uuid not null references public.agents(id) on delete cascade,
  role_label        text not null default '',
  description       text not null default '',
  amount            numeric(14,2) not null default 0,
  status            text not null default 'pending'
                      check (status in ('pending','approved','rejected','paid')),
  scheduled_date    text,
  rejected_reason   text,
  delivered_at      timestamptz,
  pdf_versions      integer not null default 0,
  last_pdf_at       timestamptz,
  last_pdf_by       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.payout_documents enable row level security;

create policy "payout_documents_select"
  on public.payout_documents for select
  using (company_id = public.my_company_id());

create policy "payout_documents_insert_admin"
  on public.payout_documents for insert
  with check (public.is_admin() and company_id = public.my_company_id());

create policy "payout_documents_update_admin"
  on public.payout_documents for update
  using (public.is_admin() and company_id = public.my_company_id());

create policy "payout_documents_delete_admin"
  on public.payout_documents for delete
  using (public.is_admin() and company_id = public.my_company_id());

drop trigger if exists set_payout_documents_updated_at on public.payout_documents;
create trigger set_payout_documents_updated_at
  before update on public.payout_documents
  for each row execute function public.handle_updated_at();
