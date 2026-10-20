-- Transpare: turn "Verificado"/"Actualizado" into a one-time checklist item
-- instead of a button that stays clickable forever after the admin already
-- replied to a team-invoice review.
-- Depends on: 001-050

alter table public.notifications
  add column if not exists responded_as text
  check (responded_as in ('verified', 'updated'));
