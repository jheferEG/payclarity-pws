-- Transpare: manual amount correction on a Payout Document
--
-- The "Documentos de pago" dialog re-syncs every payout document's amount
-- from the invoice's current split/overrides each time it's opened, so a
-- plain edit to `amount` would get silently overwritten on next open. This
-- column lets an admin pin a manual correction that wins over the
-- recomputed amount until explicitly cleared.
-- Depends on: 001-038

alter table public.payout_documents
  add column if not exists manual_amount_override numeric(14,2);
