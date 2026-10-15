-- The web app authenticates and validates every read/write on its server. Browser
-- Data API access must not bypass role checks, CAPTCHA, quotas, or private fields.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS session_version uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS session_version uuid NOT NULL DEFAULT gen_random_uuid();
DO $$
DECLARE
  app_table text;
  column_list text;
BEGIN
  FOREACH app_table IN ARRAY ARRAY[
    'users', 'admin_users', 'projects', 'site_settings', 'contact_messages',
    'workspace_projects', 'workspace_project_files', 'customer_subscriptions',
    'marketing_coupons', 'marketing_affiliates', 'custom_quotes',
    'creator_profiles', 'purchase_entitlements', 'project_intakes',
    'workspace_project_reviews', 'chat_rooms', 'chat_messages', 'chat_reads', 'support_tickets'
  ] LOOP
    IF to_regclass(format('public.%I', app_table)) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', app_table);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', app_table);
    -- Table-level revocation alone does not remove independently granted columns.
    SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO column_list
      FROM pg_attribute
      WHERE attrelid = to_regclass(format('public.%I', app_table))
        AND attnum > 0 AND NOT attisdropped;
    EXECUTE format(
      'REVOKE SELECT (%1$s), INSERT (%1$s), UPDATE (%1$s), REFERENCES (%1$s) ON TABLE public.%2$I FROM PUBLIC, anon, authenticated',
      column_list, app_table
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', app_table);
  END LOOP;
END $$;
