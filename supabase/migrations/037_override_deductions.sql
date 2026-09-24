-- Transpare: itemized deductions against a sponsor's override, per invoice
--
-- From the "Who's involved in this invoice" dialog, the admin can now add
-- named deductions (e.g. a chargeback, a correction) against a specific
-- sponsor's override on that one sale. Subtracted from the gross override
-- (computed default, or the manual override from migration 036 when set)
-- everywhere that amount is used — the preview, generated PDFs, and the
-- actual payout math in calcPayouts.
-- Depends on: 001-036

alter table public.invoices
  add column if not exists override_deductions jsonb not null default '{}'::jsonb;
