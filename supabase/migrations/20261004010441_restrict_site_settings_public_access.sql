-- Site settings include private role access configuration. Read and writes stay server-side.
drop policy if exists "Public can read site settings" on public.site_settings;
revoke all privileges on table public.site_settings from anon, authenticated;
grant select, insert, update on table public.site_settings to service_role;
