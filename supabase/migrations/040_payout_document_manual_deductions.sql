-- Transpare: named discounts on a Payout Document
--
-- Lets an admin attach one or more itemized discounts (amount + reason) to a
-- single payout document from the "Documentos de pago" dialog, each
-- subtracted from `amount` to get the final payable.
-- Depends on: 001-039

alter table public.payout_documents
  add column if not exists manual_deductions jsonb not null default '[]'::jsonb;
