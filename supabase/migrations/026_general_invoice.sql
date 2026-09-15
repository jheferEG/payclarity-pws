-- Transpare: "General invoice" — flat pay per job for subcontractor-style
-- roles (plumbers, etc.). No product-cost cascade, no override to sponsors.
-- Level/cost don't apply to these positions.

alter table public.compensation_positions
  add column if not exists is_general_invoice boolean not null default false,
  add column if not exists install_fixed_pay numeric(14,2),
  add column if not exists service_fixed_pay numeric(14,2);

alter table public.invoices
  add column if not exists is_general_invoice boolean not null default false,
  add column if not exists job_type text check (job_type in ('installation', 'service')),
  add column if not exists fixed_pay numeric(14,2),
  add column if not exists extras text[];
