-- Transpare: manual per-invoice override amount corrections
--
-- Lets an admin edit a specific sponsor's override $ amount directly from
-- the "Who's involved in this invoice" dialog, for that one sale only —
-- instead of the amount always being whatever the level rate/cost-cascade
-- computes. Stored as a map of agentId -> manual $ amount so it never
-- touches the override rate table or any other invoice.
-- Depends on: 001-035

alter table public.invoices
  add column if not exists override_amount_overrides jsonb not null default '{}'::jsonb;
