-- Transpare: agents can be paid under a company/LLC name instead of their
-- own (subcontractors — plumbers, etc.). Optional field; when set, invoices
-- show "Company Name — Person Name" instead of just the person's name.

alter table public.agents
  add column if not exists company_name text;
