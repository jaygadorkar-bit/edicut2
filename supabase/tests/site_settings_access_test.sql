BEGIN;
SELECT plan(9);

SELECT ok(NOT has_table_privilege('anon', 'public.site_settings', 'SELECT'), 'anon cannot read site settings');
SELECT ok(NOT has_table_privilege('anon', 'public.site_settings', 'INSERT'), 'anon cannot insert site settings');
SELECT ok(NOT has_table_privilege('anon', 'public.site_settings', 'UPDATE'), 'anon cannot update site settings');
SELECT ok(NOT has_table_privilege('authenticated', 'public.site_settings', 'SELECT'), 'authenticated cannot read site settings');
SELECT ok(NOT has_table_privilege('authenticated', 'public.site_settings', 'INSERT'), 'authenticated cannot insert site settings');
SELECT ok(NOT has_table_privilege('authenticated', 'public.site_settings', 'UPDATE'), 'authenticated cannot update site settings');
SELECT ok(has_table_privilege('service_role', 'public.site_settings', 'SELECT'), 'service_role can read site settings');
SELECT ok(has_table_privilege('service_role', 'public.site_settings', 'INSERT'), 'service_role can insert site settings');
SELECT ok(has_table_privilege('service_role', 'public.site_settings', 'UPDATE'), 'service_role can update site settings');

SELECT * FROM finish();
ROLLBACK;
