-- Transpare: a sponsor can only update their DIRECT reports' invoices
--
-- 044/046's invoices_update_sponsor used is_sponsor_of(), which walks the
-- whole ancestor chain — so Jose Mejia (Kevin Rugel's own sponsor) could
-- approve/discount Sara Fernandez's invoice too, since Jose is Sara's
-- sponsor's sponsor. That's wrong: "Invoices de equipo" is meant to let a
-- sponsor see their whole downline for oversight, but only ACT on the sales
-- made by the people directly under them — anyone further down is someone
-- else's call (their direct sponsor's), not this bypassing them via the
-- chain. Replaces the transitive check with a direct sponsor_id match.
-- Depends on: 001-046

drop policy if exists "invoices_update_sponsor" on public.invoices;

create policy "invoices_update_sponsor"
  on public.invoices for update
  using (
    company_id = public.my_company_id()
    and agent_id in (
      select id from public.agents where sponsor_id = public.my_agent_id()
    )
  )
  with check (
    company_id = public.my_company_id()
    and agent_id in (
      select id from public.agents where sponsor_id = public.my_agent_id()
    )
  );
