-- Chosen once in the Setup Wizard: whether reps' pay is entered company-wide
-- as a flat $ per invoice (which doubles as "Costo del producto") or as a %.
-- Only the matching field is shown across the app instead of both at once.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS commission_entry_mode TEXT NOT NULL DEFAULT 'fixed'
    CHECK (commission_entry_mode IN ('fixed', 'percent'));
