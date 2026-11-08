-- Keep read state on the account so notifications stay acknowledged across devices.
CREATE TABLE IF NOT EXISTS public.user_workspace_event_reads (
  event_id varchar(180) NOT NULL,
  is_read boolean NOT NULL DEFAULT true,
  read_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  CONSTRAINT user_workspace_event_reads_pkey PRIMARY KEY (event_id, user_id),
  CONSTRAINT user_workspace_event_reads_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

ALTER TABLE public.user_workspace_event_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.user_workspace_event_reads
  FROM PUBLIC, anon, authenticated, service_role;
CREATE INDEX IF NOT EXISTS user_workspace_event_reads_updated_at_idx
  ON public.user_workspace_event_reads (updated_at);

-- Invalidate only the affected user's private workspace channel after bulk
-- receipt writes, without broadcasting event identifiers or receipt data.
CREATE OR REPLACE FUNCTION private.broadcast_user_workspace_event_read_invalidation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    FOR target_user_id IN EXECUTE
      'SELECT DISTINCT user_id FROM old_workspace_event_reads'
    LOOP
      PERFORM private.send_edicut_workspace_invalidation(
        'edicut:user:' || target_user_id::text
      );
    END LOOP;
  ELSE
    FOR target_user_id IN EXECUTE
      'SELECT DISTINCT user_id FROM new_workspace_event_reads'
    LOOP
      PERFORM private.send_edicut_workspace_invalidation(
        'edicut:user:' || target_user_id::text
      );
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.broadcast_user_workspace_event_read_invalidation()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS user_workspace_event_reads_insert_invalidation
  ON public.user_workspace_event_reads;
CREATE TRIGGER user_workspace_event_reads_insert_invalidation
  AFTER INSERT ON public.user_workspace_event_reads
  REFERENCING NEW TABLE AS new_workspace_event_reads
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.broadcast_user_workspace_event_read_invalidation();

DROP TRIGGER IF EXISTS user_workspace_event_reads_update_invalidation
  ON public.user_workspace_event_reads;
CREATE TRIGGER user_workspace_event_reads_update_invalidation
  AFTER UPDATE ON public.user_workspace_event_reads
  REFERENCING NEW TABLE AS new_workspace_event_reads
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.broadcast_user_workspace_event_read_invalidation();

DROP TRIGGER IF EXISTS user_workspace_event_reads_delete_invalidation
  ON public.user_workspace_event_reads;
CREATE TRIGGER user_workspace_event_reads_delete_invalidation
  AFTER DELETE ON public.user_workspace_event_reads
  REFERENCING OLD TABLE AS old_workspace_event_reads
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.broadcast_user_workspace_event_read_invalidation();
