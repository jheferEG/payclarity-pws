-- Transpare: configurable "technician" terminology
--
-- The client asked for consistent, configurable wording for the
-- general-invoice/technician role (some companies say "Technician",
-- others "Installer", "Contractor", etc.). Empty = fall back to the
-- built-in EN/ES default (see technicianTerm() in commission-store.ts).
-- Depends on: 001-032

alter table public.companies
  add column if not exists technician_term_singular text,
  add column if not exists technician_term_plural text;
