-- The admin app writes settings through a server-side service-role client.
-- Keep its access limited to the select/insert/update operations used by upsert.
grant select, insert, update on table public.site_settings to service_role;
