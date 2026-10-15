BEGIN;
SELECT plan(10);

CREATE TEMP TABLE realtime_test_accounts (
  user_id uuid NOT NULL,
  inactive_user_id uuid NOT NULL,
  admin_id uuid NOT NULL,
  other_admin_id uuid NOT NULL
);

INSERT INTO realtime_test_accounts VALUES (
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
);

INSERT INTO public.users (id, email, name, active)
SELECT user_id, 'broadcast-client-' || user_id || '@example.test', 'Realtime client', true
FROM realtime_test_accounts;
INSERT INTO public.users (id, email, name, active)
SELECT inactive_user_id, 'broadcast-inactive-' || inactive_user_id || '@example.test', 'Inactive realtime client', false
FROM realtime_test_accounts;
INSERT INTO public.admin_users (id, email, name, password_hash, role, active)
SELECT admin_id, 'broadcast-admin-' || admin_id || '@example.test', 'Realtime admin', 'test-only', 'admin', true
FROM realtime_test_accounts;
INSERT INTO public.admin_users (id, email, name, password_hash, role, active)
SELECT other_admin_id, 'broadcast-disabled-admin-' || other_admin_id || '@example.test', 'Disabled realtime admin', 'test-only', 'admin', false
FROM realtime_test_accounts;

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', user_id::text, true)
FROM realtime_test_accounts;
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'role', 'authenticated',
  'sub', user_id::text,
  'email', 'broadcast-client-' || user_id || '@example.test'
)::text, true)
FROM realtime_test_accounts;
SELECT set_config('realtime.topic', 'edicut:user:' || user_id::text, true)
FROM realtime_test_accounts;
SELECT ok(private.can_receive_edicut_workspace_broadcast(), 'active user receives only the topic bound to its email');

SELECT set_config('realtime.topic', 'edicut:user:' || inactive_user_id::text, true)
FROM realtime_test_accounts;
SELECT ok(NOT private.can_receive_edicut_workspace_broadcast(), 'user cannot subscribe to another account topic');

SELECT set_config('realtime.topic', 'edicut:admin:' || admin_id::text, true)
FROM realtime_test_accounts;
SELECT ok(NOT private.can_receive_edicut_workspace_broadcast(), 'client cannot subscribe to an admin topic');

SELECT set_config('request.jwt.claims', jsonb_build_object(
  'role', 'authenticated',
  'sub', inactive_user_id::text,
  'email', 'broadcast-inactive-' || inactive_user_id || '@example.test'
)::text, true)
FROM realtime_test_accounts;
SELECT set_config('request.jwt.claim.sub', inactive_user_id::text, true)
FROM realtime_test_accounts;
SELECT set_config('realtime.topic', 'edicut:user:' || inactive_user_id::text, true)
FROM realtime_test_accounts;
SELECT ok(NOT private.can_receive_edicut_workspace_broadcast(), 'inactive accounts cannot subscribe');

SELECT set_config('request.jwt.claims', jsonb_build_object(
  'role', 'authenticated',
  'sub', admin_id::text,
  'email', 'broadcast-admin-' || admin_id || '@example.test'
)::text, true)
FROM realtime_test_accounts;
SELECT set_config('request.jwt.claim.sub', admin_id::text, true)
FROM realtime_test_accounts;
SELECT set_config('realtime.topic', 'edicut:admin:' || admin_id::text, true)
FROM realtime_test_accounts;
SELECT ok(private.can_receive_edicut_workspace_broadcast(), 'active administrator receives its own admin topic');

SELECT set_config('realtime.topic', 'edicut:admin:' || other_admin_id::text, true)
FROM realtime_test_accounts;
SELECT ok(NOT private.can_receive_edicut_workspace_broadcast(), 'administrator cannot subscribe to another admin topic');

SELECT ok(NOT has_function_privilege('anon', 'private.can_receive_edicut_workspace_broadcast()', 'EXECUTE'), 'anonymous users cannot call the authorization helper');
SELECT ok(has_schema_privilege('authenticated', 'private', 'USAGE'), 'authenticated role can evaluate the Realtime policy helper');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'realtime'
    AND tablename = 'messages'
    AND policyname = 'EdiCut workspace broadcast scope is enforced'
    AND permissive = 'RESTRICTIVE'
), 'restrictive policy prevents broader policies from exposing topics');
SELECT is((
  SELECT count(*)::integer FROM pg_trigger
  WHERE NOT tgisinternal AND tgname LIKE '%\_realtime\_invalidation' ESCAPE '\'
), 8, 'all eight application tables have invalidation triggers');

SELECT * FROM finish();
ROLLBACK;
