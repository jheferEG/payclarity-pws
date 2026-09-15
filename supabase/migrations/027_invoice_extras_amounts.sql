-- Transpare: general-invoice "Extras" now carry their own $ amount each
-- (mileage, materials, etc. add on top of the fixed pay) instead of being
-- plain category tags. Replaces the text[] column with jsonb storing
-- [{ "category": "mileage", "amount": 40 }, ...].

alter table public.invoices drop column if exists extras;
alter table public.invoices add column extras jsonb;
