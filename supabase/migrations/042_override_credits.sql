-- Transpare: the other direction of migration 037 — itemized credits
--
-- Money sometimes moves the opposite way: a sponsor personally fronted a
-- seller an advance and needs it moved back onto their own override, or
-- gets credited a referral fee. Same shape as override_deductions, added
-- instead of subtracted, everywhere that amount is used — the preview,
-- generated PDFs, and calcPayouts.
-- Depends on: 001-041

alter table public.invoices
  add column if not exists override_credits jsonb not null default '{}'::jsonb;
