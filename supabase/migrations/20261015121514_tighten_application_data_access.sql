-- The app accesses application tables through its server-side Postgres client.
-- The Supabase service-role REST client is used only for site_settings and Auth admin APIs.
REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  app_table text;
  column_list text;
BEGIN
  FOR app_table IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', app_table);

    SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
      INTO column_list
      FROM pg_attribute
      WHERE attrelid = to_regclass(format('public.%I', app_table))
        AND attnum > 0 AND NOT attisdropped;

    IF column_list IS NOT NULL THEN
      EXECUTE format(
        'REVOKE SELECT (%1$s), INSERT (%1$s), UPDATE (%1$s), REFERENCES (%1$s) ON TABLE public.%2$I FROM PUBLIC, anon, authenticated, service_role',
        column_list, app_table
      );
    END IF;
  END LOOP;
END $$;

-- Default privileges are deliberately closed for all app-managed DDL, which
-- connects as postgres. Future tables need explicit server-side grants.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.site_settings TO service_role;
