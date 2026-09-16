-- Diagnostic only — NOT a migration. Run this in the Supabase SQL Editor
-- to see which of migrations 020-028 are still missing. Each row's
-- "applied" column tells you if that migration already ran.

select '020_photo_and_attachment_fields' as migration,
  exists (select 1 from information_schema.columns
    where table_name = 'disputes' and column_name = 'attachment_url') as applied
union all
select '021_scheduled_payments',
  exists (select 1 from information_schema.columns
    where table_name = 'payments' and column_name = 'scheduled_date')
union all
select '022_payout_documents',
  exists (select 1 from information_schema.tables
    where table_name = 'payout_documents')
union all
select '023_commission_entry_mode',
  exists (select 1 from information_schema.columns
    where table_name = 'companies' and column_name = 'commission_entry_mode')
union all
select '024_link_agent_to_profile',
  exists (select 1 from information_schema.triggers
    where trigger_name = 'on_agent_email_set')
union all
select '025_agent_company_name',
  exists (select 1 from information_schema.columns
    where table_name = 'agents' and column_name = 'company_name')
union all
select '026_general_invoice',
  exists (select 1 from information_schema.columns
    where table_name = 'invoices' and column_name = 'is_general_invoice')
union all
select '027_invoice_extras_amounts',
  exists (select 1 from information_schema.columns
    where table_name = 'invoices' and column_name = 'extras' and data_type = 'jsonb')
union all
select '028_cash_customer_invoice',
  exists (select 1 from information_schema.columns
    where table_name = 'invoices' and column_name = 'customer_address');
