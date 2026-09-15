-- Transpare: customer-facing cash invoice/receipt fields — the document
-- handed to the customer (not the internal commission PDF), used when
-- they pay cash and are tracked via "abonos" (installment payments).

alter table public.invoices
  add column if not exists customer_address text,
  add column if not exists customer_phone text,
  add column if not exists invoice_item_label text,
  add column if not exists customer_payments jsonb,
  add column if not exists payment_plan_note text;
