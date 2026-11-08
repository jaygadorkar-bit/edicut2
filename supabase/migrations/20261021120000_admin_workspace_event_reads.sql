-- Administrator workspace event read receipts are shared across admins and are
-- only written through the authenticated application server.
CREATE TABLE IF NOT EXISTS public.admin_workspace_event_reads (
  event_id varchar(180) PRIMARY KEY,
  is_read boolean NOT NULL DEFAULT true,
  read_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  read_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL
);
ALTER TABLE public.admin_workspace_event_reads ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS admin_workspace_event_reads_updated_at_idx
  ON public.admin_workspace_event_reads (updated_at);

-- Keep connected admin dashboards in sync without broadcasting event details.
-- A statement trigger emits one invalidation per bulk receipt update.
CREATE OR REPLACE FUNCTION private.broadcast_admin_workspace_event_read_invalidation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_admin_id uuid;
BEGIN
  FOR target_admin_id IN
    SELECT id
    FROM public.admin_users
    WHERE active AND role = 'admin'
  LOOP
    PERFORM private.send_edicut_workspace_invalidation(
      'edicut:admin:' || target_admin_id::text
    );
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.broadcast_admin_workspace_event_read_invalidation()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS admin_workspace_event_reads_realtime_invalidation
  ON public.admin_workspace_event_reads;
CREATE TRIGGER admin_workspace_event_reads_realtime_invalidation
  AFTER INSERT OR UPDATE OR DELETE ON public.admin_workspace_event_reads
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.broadcast_admin_workspace_event_read_invalidation();
