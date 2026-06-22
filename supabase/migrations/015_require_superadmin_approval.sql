-- Migration 015: All new company users require superadmin approval
-- Run AFTER 014_fix_trigger.sql
--
-- Previously the first user in a company was auto-approved (status='active').
-- Now ALL users start as 'pending' regardless of company position.
-- The superadmin must approve them from the panel before they can log in.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id     uuid;
  v_existing_count integer;
  v_role           text;
BEGIN
  v_company_id := nullif(trim(new.raw_user_meta_data->>'company_id'), '')::uuid;

  IF v_company_id IS NOT NULL THEN
    SELECT count(*) INTO v_existing_count
    FROM public.profiles
    WHERE company_id = v_company_id;

    -- First user in company: mark as intended admin so superadmin knows the role
    -- but keep status='pending' — superadmin must still approve
    IF v_existing_count = 0 THEN
      v_role := 'admin';
    ELSE
      v_role := null;
    END IF;
  ELSE
    -- No company_id: superadmin invite flow — starts pending too
    v_role := null;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, is_superadmin, status, company_id)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    v_role,
    false,
    'pending',   -- Always pending; superadmin must approve before user can log in
    v_company_id
  )
  ON CONFLICT (id) DO UPDATE
    SET
      role       = EXCLUDED.role,
      status     = EXCLUDED.status,
      company_id = coalesce(profiles.company_id, EXCLUDED.company_id),
      updated_at = timezone('utc', now());

  RETURN new;
END;
$$;
