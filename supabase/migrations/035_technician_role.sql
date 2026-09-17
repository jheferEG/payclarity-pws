-- Transpare: "technician" as its own login role
--
-- Until now a technician had to log in as "rep" to reach their own Work
-- Statements — workable, but a rep's nav also shows Wallet/commission
-- history/Invoices, none of which a pure technician should see. This adds
-- a dedicated `technician` role with its own restricted portal (just their
-- Work Statements) and tightens a few RLS SELECT policies that were
-- company-wide (readable by any authenticated member, reps/technicians
-- included) to admin/accountant-only, matching the client's "privacidad
-- del portal de técnico" ask.
--
-- Depends on: 001-034

-- ── 1. Allow 'technician' in both role check constraints ────────────────────
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
  CHECK (role IN ('admin', 'rep', 'accountant', 'technician') OR role IS NULL);

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
  CHECK (role IN ('admin', 'rep', 'accountant', 'technician'));

-- ── 2. Technicians only ever see their own Work Statements, same as reps
--       already only see their own invoices in the UI — now enforced at the
--       RLS layer too, regardless of role, instead of a blanket
--       company-wide SELECT. ───────────────────────────────────────────────
DROP POLICY IF EXISTS "technician_work_statements_select" ON public.technician_work_statements;
CREATE POLICY "technician_work_statements_select"
  ON public.technician_work_statements FOR SELECT
  USING (
    company_id = public.my_company_id()
    AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant'))
      OR technician_id = public.my_agent_id()
    )
  );

-- ── 3. Weekly batches and customer invoices are admin/accountant concerns —
--       a rep/technician has no legitimate reason to read them directly,
--       even though neither was ever exposed to them in the UI. Matches the
--       pattern already used for payroll_registers (migration 032). ────────
DROP POLICY IF EXISTS "weekly_technician_statements_select" ON public.weekly_technician_statements;
CREATE POLICY "weekly_technician_statements_select"
  ON public.weekly_technician_statements FOR SELECT
  USING (
    company_id = public.my_company_id()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant'))
  );

DROP POLICY IF EXISTS "customer_invoices_select" ON public.customer_invoices;
CREATE POLICY "customer_invoices_select"
  ON public.customer_invoices FOR SELECT
  USING (
    company_id = public.my_company_id()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant'))
  );
