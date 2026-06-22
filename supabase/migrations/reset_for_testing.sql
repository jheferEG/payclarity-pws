-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  PayClarity — RESET COMPLETO PARA PRUEBAS                          ║
-- ║  Borra usuarios, empresas y todos los datos ingresados.            ║
-- ║  CONSERVA las cuentas con is_superadmin = true.                    ║
-- ║                                                                    ║
-- ║  ⚠️  IRREVERSIBLE — úsalo solo en entorno de pruebas.              ║
-- ║  Corre en: Supabase Dashboard → SQL Editor                        ║
-- ╚══════════════════════════════════════════════════════════════════════╝

do $$
declare
  superadmin_ids  uuid[];
  company_ids     uuid[];
  deleted_users   integer;
  deleted_cos     integer;
begin

  -- ── 0. Identificar superadmins (estos NO se tocan) ─────────────────
  select array_agg(id) into superadmin_ids
  from public.profiles
  where is_superadmin = true;

  raise notice '──────────────────────────────────────────────';
  raise notice 'RESET PayClarity — iniciando...';
  raise notice 'Superadmins protegidos: %',
    coalesce(array_length(superadmin_ids, 1), 0);

  -- ── 1. Capturar IDs de empresas que se van a borrar ────────────────
  select array_agg(id) into company_ids
  from public.companies;

  raise notice 'Empresas a eliminar: %',
    coalesce(array_length(company_ids, 1), 0);

  -- ── 2. Borrar usuarios no-superadmin de auth.users ─────────────────
  --    ON DELETE CASCADE lleva profiles con ellos automáticamente.
  if superadmin_ids is not null then
    delete from auth.users
    where id <> all(superadmin_ids);
  else
    delete from auth.users;
  end if;

  get diagnostics deleted_users = row_count;
  raise notice 'auth.users eliminados: %', deleted_users;

  -- ── 3. Borrar notificaciones (no tienen cascade directo de company) ─
  delete from public.notifications;

  -- ── 4. Borrar dispute_events → disputes ────────────────────────────
  delete from public.dispute_events;
  delete from public.disputes;

  -- ── 5. Borrar invoice hijos → invoices ─────────────────────────────
  delete from public.invoice_split_participants;
  delete from public.invoice_splits;
  delete from public.invoice_line_items;
  delete from public.invoice_pdf_records;
  delete from public.invoices;

  -- ── 6. Borrar pagos y ajustes ──────────────────────────────────────
  delete from public.payments;
  delete from public.adjustments;

  -- ── 7. Borrar agentes (FK a invoices ya limpia) ────────────────────
  delete from public.agents;

  -- ── 8. Borrar catálogos de empresa ─────────────────────────────────
  delete from public.split_template_positions;
  delete from public.split_templates;
  delete from public.split_rules;
  delete from public.commission_tiers;
  delete from public.override_levels;
  delete from public.finance_companies;
  delete from public.products;
  delete from public.compensation_positions;
  delete from public.tax_reserve_by_state;

  -- ── 9. Borrar contadores de facturas ───────────────────────────────
  delete from public.invoice_sequences;

  -- ── 10. Borrar company_config ──────────────────────────────────────
  delete from public.company_config;

  -- ── 11. Borrar empresas ────────────────────────────────────────────
  delete from public.companies;

  get diagnostics deleted_cos = row_count;
  raise notice 'Empresas eliminadas: %', deleted_cos;

  -- ── 12. Limpiar company_id del superadmin (ya debería ser null) ────
  if superadmin_ids is not null then
    update public.profiles
    set company_id = null
    where id = any(superadmin_ids);
  end if;

  raise notice '──────────────────────────────────────────────';
  raise notice 'RESET COMPLETO. Base de datos lista para pruebas.';
  raise notice 'Superadmin intacto. Crea una empresa nueva desde el panel.';
  raise notice '──────────────────────────────────────────────';

end $$;
