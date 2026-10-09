-- Transpare: "analyst" as its own login role
--
-- A read-only portal for someone who needs to see only their own invoices
-- (view/download PDF, file a correction request) and how much they've
-- earned — no Wallet admin controls, no company-wide figures, no editing.
-- Mirrors exactly how "technician" was added as its own role in migration
-- 035; an analyst is linked to an Agent row the same way (agents.profile_id
-- -> auth.uid(), resolved client-side via the my_agent_id() RPC).
--
-- Depends on: 001-040

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'profiles_role_check' AND table_name = 'profiles'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
  END IF;
END $$;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'rep', 'accountant', 'technician', 'analyst') OR role IS NULL);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'user_company_access_role_check' AND table_name = 'user_company_access'
  ) THEN
    ALTER TABLE public.user_company_access DROP CONSTRAINT user_company_access_role_check;
  END IF;
END $$;
ALTER TABLE public.user_company_access
  ADD CONSTRAINT user_company_access_role_check
  CHECK (role IN ('admin', 'rep', 'accountant', 'technician', 'analyst'));
