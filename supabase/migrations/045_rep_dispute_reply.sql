-- Transpare: a rep replying to their own "needs info" request errored out,
-- and the admin never got notified about it
--
-- Two gaps surfaced together:
--
-- 1. disputes had no update policy for a non-admin at all (only
--    disputes_update_admin, 007). Replying appends a dispute_event (allowed
--    by dispute_events_insert_rep, 007) but the client's generic sync also
--    re-upserts the parent disputes row on every change to it — that upsert
--    was rejected by RLS, surfacing as "No se pudo enviar la solicitud al
--    servidor" even though the reply itself (the event) went through fine.
--
-- 2. notifications only allows admin/RPC inserts (008's comment literally
--    says non-admins should go through create_notification()), but the
--    client's generic notifications sync does a direct table upsert for
--    every notification regardless of who created it — so the "rep
--    replied" notification meant for the admin silently never reached the
--    server, and the admin never saw any alert.
--
-- Depends on: 001-044

create policy "disputes_update_rep"
  on public.disputes for update
  using (
    company_id = public.my_company_id()
    and agent_id = public.my_agent_id()
  );

create policy "notifications_insert_rep_reply"
  on public.notifications for insert
  with check (
    company_id = public.my_company_id()
    and kind = 'dispute_replied'
    and audience = 'admin'
    and dispute_id in (
      select id from public.disputes where agent_id = public.my_agent_id()
    )
  );
