-- Transpare: let a sponsor update their downline's invoices (team review)
--
-- "Invoices de equipo" (043) lets a sponsor — any agent with people below
-- them in the agent tree, regardless of login role — approve a downline
-- sale or add a discount/credit against their own override on it. The UI
-- only ever touches override_deductions/override_credits/manager_reviewed_*,
-- but invoices_update_admin (005) only allows admins to UPDATE the table at
-- all, so every non-admin sponsor's save was rejected by RLS before it ever
-- reached the client. Mirrors the existing is_admin()/my_agent_id() pattern
-- (001, 004) rather than a new mechanism; the client UI is what keeps a
-- sponsor from touching anything beyond their own override, the same trust
-- boundary this app already uses for admin's own blanket update policy.
-- Depends on: 001-043

create or replace function public.is_sponsor_of(p_sponsor_id uuid, p_agent_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  with recursive up as (
    select sponsor_id, 1 as depth from public.agents where id = p_agent_id
    union all
    select a.sponsor_id, up.depth + 1
    from public.agents a
    join up on a.id = up.sponsor_id
    where up.depth < 20
  )
  select p_sponsor_id is not null and exists (select 1 from up where sponsor_id = p_sponsor_id);
$$;

create policy "invoices_update_sponsor"
  on public.invoices for update
  using (
    company_id = public.my_company_id()
    and public.is_sponsor_of(public.my_agent_id(), agent_id)
  );
