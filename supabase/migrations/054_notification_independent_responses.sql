-- Transpare: "Verificado" and "Actualizado" are independent checklist items,
-- not two labels for the same one-time response — clicking one must not
-- resolve the other. Replaces 051's single responded_as column with two
-- independent flags.
-- Depends on: 001-053

alter table public.notifications
  drop column if exists responded_as;

alter table public.notifications
  add column if not exists responded_verified boolean not null default false,
  add column if not exists responded_updated boolean not null default false;
