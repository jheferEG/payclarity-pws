-- Transpare: track WHO a notification is about, separate from its audience
-- — lets the admin reply straight back to the specific sponsor who reported
-- a team-invoice adjustment ("Verificado"/"Actualizado"), instead of only
-- being able to notify "admin" or a single fixed agent.
-- Depends on: 001-049

alter table public.notifications
  add column if not exists actor_agent_id uuid references public.agents(id) on delete set null;
