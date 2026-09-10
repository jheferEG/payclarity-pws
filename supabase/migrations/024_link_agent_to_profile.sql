-- Transpare: link agents to profiles in BOTH directions
--
-- 004_agents.sql only links an agent to a profile when the PROFILE gets
-- approved (status -> 'active'), by matching email. That only works if the
-- rep's account is approved AFTER the admin has already added them to
-- Equipo (agents) with a matching email. In practice admins often add the
-- agent row first — with the rep's name and their $ / % commission rule —
-- and only later invite the rep to create their account. In that order the
-- profiles trigger never fires again for that rep, agents.profile_id stays
-- null forever, public.my_agent_id() returns null for them, and every RLS
-- policy keyed on "agent_id = public.my_agent_id()" (invoices, disputes,
-- dispute_events) silently rejects their inserts — new invoices/dispute
-- submissions look fine in the app (optimistic local state) but never
-- reach the database, their wallet stays empty, and nothing shows up for
-- them in admin's approval queue.
--
-- This adds the missing direction: whenever an agent row is inserted or
-- its email changes, look for an already-active profile with a matching
-- email in the same company and link it.

create or replace function public.link_agent_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.profile_id is null and new.email is not null and new.email <> '' then
    update public.agents
    set profile_id = (
      select p.id
      from public.profiles p
      where lower(p.email) = lower(new.email)
        and p.company_id = new.company_id
        and p.status = 'active'
        and p.role is not null
      limit 1
    )
    where id = new.id
      and profile_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists on_agent_email_set on public.agents;
create trigger on_agent_email_set
  after insert or update of email on public.agents
  for each row execute function public.link_agent_to_profile();

-- One-time backfill for any agent/profile pairs that already exist but
-- missed the link under the old one-directional trigger.
update public.agents a
set profile_id = p.id
from public.profiles p
where a.profile_id is null
  and lower(a.email) = lower(p.email)
  and a.company_id = p.company_id
  and p.status = 'active'
  and p.role is not null;
