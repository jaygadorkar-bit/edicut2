-- Keep notification receipts per administrator. Older releases stored one
-- shared receipt per event; preserve that state for every admin when splitting
-- it into per-admin rows.
CREATE TEMP TABLE admin_workspace_event_reads_legacy_unowned AS
SELECT event_id, is_read, read_at, updated_at
FROM public.admin_workspace_event_reads
WHERE read_by IS NULL;

DELETE FROM public.admin_workspace_event_reads WHERE read_by IS NULL;

ALTER TABLE public.admin_workspace_event_reads
  DROP CONSTRAINT IF EXISTS admin_workspace_event_reads_pkey;
ALTER TABLE public.admin_workspace_event_reads
  DROP CONSTRAINT IF EXISTS admin_workspace_event_reads_read_by_admin_users_id_fk;
ALTER TABLE public.admin_workspace_event_reads
  DROP CONSTRAINT IF EXISTS admin_workspace_event_reads_read_by_fkey;
ALTER TABLE public.admin_workspace_event_reads
  ALTER COLUMN read_by SET NOT NULL;
ALTER TABLE public.admin_workspace_event_reads
  ADD CONSTRAINT admin_workspace_event_reads_read_by_admin_users_id_fk
  FOREIGN KEY (read_by) REFERENCES public.admin_users(id) ON DELETE CASCADE;
ALTER TABLE public.admin_workspace_event_reads
  ADD CONSTRAINT admin_workspace_event_reads_pkey PRIMARY KEY (event_id, read_by);

INSERT INTO public.admin_workspace_event_reads (event_id, is_read, read_at, updated_at, read_by)
SELECT legacy.event_id,
       legacy.is_read,
       CASE WHEN legacy.is_read THEN COALESCE(legacy.read_at, legacy.updated_at, now()) ELSE NULL END,
       legacy.updated_at,
       admin.id
FROM admin_workspace_event_reads_legacy_unowned AS legacy
CROSS JOIN public.admin_users AS admin
WHERE admin.role = 'admin'
ON CONFLICT (event_id, read_by) DO NOTHING;

DROP TABLE admin_workspace_event_reads_legacy_unowned;
