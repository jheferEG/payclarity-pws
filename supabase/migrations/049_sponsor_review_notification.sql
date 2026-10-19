-- Transpare: notify the admin when a sponsor approves or discounts/credits
-- a downline invoice — right now the only way to find out was to open each
-- invoice's "Ver invoices" dialog one by one.
-- Depends on: 001-048

alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check
  check (kind in (
    'dispute_submitted','dispute_replied','dispute_status',
    'dispute_claimed','split_changed','pdf_regenerated',
    'team_invoice_reviewed','info'
  ));

create policy "notifications_insert_sponsor_review"
  on public.notifications for insert
  with check (
    company_id = public.my_company_id()
    and kind = 'team_invoice_reviewed'
    and audience = 'admin'
    and invoice_id in (
      select id from public.invoices
      where agent_id in (
        select id from public.agents where sponsor_id = public.my_agent_id()
      )
    )
  );
