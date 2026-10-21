-- Transpare: let an admin see ANY notification in their company — including
-- ones addressed to a specific agent, not just ones addressed to "admin"
--
-- Same upsert-needs-SELECT-to-check-for-conflicts issue as 052, mirrored:
-- when the admin replies to a sponsor's review ("Verificado"/"Actualizado"),
-- that notification's audience is the sponsor's own agent id, not 'admin'.
-- notifications_select only grants an admin visibility when audience =
-- 'admin', so the admin couldn't see the very row they just created for
-- someone else, and the upsert's conflict-check failed the same way.
-- Admins having blanket visibility into their own company's notifications
-- is also just the right default everywhere else in this app already.
-- Depends on: 001-052

create policy "notifications_select_admin_all"
  on public.notifications for select
  using (
    company_id = public.my_company_id()
    and public.is_admin()
  );
