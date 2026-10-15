BEGIN;
SELECT plan(1);

SELECT lives_ok($check$
DO $$
DECLARE
  app_table text;
  browser_role text;
  permission text;
BEGIN
  FOREACH app_table IN ARRAY ARRAY[
    'users', 'admin_users', 'projects', 'site_settings', 'contact_messages',
    'workspace_projects', 'workspace_project_files', 'customer_subscriptions',
    'marketing_coupons', 'marketing_affiliates', 'custom_quotes',
    'creator_profiles', 'purchase_entitlements', 'project_intakes',
    'workspace_project_reviews', 'chat_rooms', 'chat_messages', 'chat_reads', 'support_tickets'
  ] LOOP
    IF to_regclass(format('public.%I', app_table)) IS NULL THEN CONTINUE; END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass(format('public.%I', app_table))) THEN
      RAISE EXCEPTION 'RLS is disabled on %', app_table;
    END IF;
    FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      FOREACH permission IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
        IF has_table_privilege(browser_role, format('public.%I', app_table), permission) THEN
          RAISE EXCEPTION 'Unexpected % privilege for % on %', permission, browser_role, app_table;
        END IF;
      END LOOP;
      FOREACH permission IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
        IF has_any_column_privilege(browser_role, format('public.%I', app_table), permission) THEN
          RAISE EXCEPTION 'Unexpected column % privilege for % on %', permission, browser_role, app_table;
        END IF;
      END LOOP;
      IF app_table <> 'site_settings' THEN
        FOREACH permission IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
          IF has_any_column_privilege('service_role', format('public.%I', app_table), permission) THEN
            RAISE EXCEPTION 'Unexpected column % privilege for service_role on %', permission, app_table;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
    FOREACH permission IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      IF app_table = 'site_settings' AND permission IN ('SELECT', 'INSERT', 'UPDATE') THEN
        IF NOT has_table_privilege('service_role', format('public.%I', app_table), permission) THEN
          RAISE EXCEPTION 'Missing site-settings server % privilege', permission;
        END IF;
      ELSIF has_table_privilege('service_role', format('public.%I', app_table), permission) THEN
        RAISE EXCEPTION 'Unexpected service_role % privilege on %', permission, app_table;
      END IF;
    END LOOP;
  END LOOP;
END $$;
$check$, 'browser roles have no direct app-table access and server grants stay explicit');

SELECT * FROM finish();
ROLLBACK;
