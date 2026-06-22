-- Migration 013: Separate is_superadmin flag from company role
-- Allows one account to be both a system superadmin AND a company admin.

-- ── 1. Add the is_superadmin column ──────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_superadmin boolean NOT NULL DEFAULT false;

-- ── 2. Migrate existing superadmin-role rows ─────────────────────────────────
-- Set the flag, clear the role (they had no company role)
UPDATE public.profiles SET is_superadmin = true, role = null WHERE role = 'superadmin';

-- ── 3. Drop old role check constraint and add new one (no "superadmin" value) ─
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
  CHECK (role IN ('admin', 'rep', 'accountant') OR role IS NULL);

-- ── 4. Update is_superadmin() to use the new column ──────────────────────────
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_superadmin FROM public.profiles WHERE id = auth.uid() AND status = 'active'),
    false
  );
$$;

-- ── 5. Update consume_superadmin_invite to set the flag instead of role ───────
CREATE OR REPLACE FUNCTION public.consume_superadmin_invite(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM public.superadmin_invites WHERE token = p_token AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Invite token inválido o ya utilizado';
  END IF;

  UPDATE public.superadmin_invites
    SET status = 'used', used_by = auth.uid(), used_at = now()
  WHERE token = p_token;

  -- Set is_superadmin flag; leave role/company_id untouched (preserves dual role)
  UPDATE public.profiles
    SET is_superadmin = true, status = 'pending'
  WHERE id = auth.uid();
END;
$$;
