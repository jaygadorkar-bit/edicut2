-- Skip database-trigger broadcasts when Supabase has not created today's
-- partition. Connected clients still receive invalidations through Realtime;
-- HTTP polling remains the recovery path if a partition is unavailable.
CREATE OR REPLACE FUNCTION private.send_edicut_workspace_invalidation(topic text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF topic IS NULL OR length(topic) > 96 OR topic NOT LIKE 'edicut:%' THEN
    RETURN;
  END IF;

  IF pg_catalog.to_regclass(
    'realtime.messages_' || pg_catalog.to_char(
      pg_catalog.timezone('UTC', pg_catalog.now()),
      'YYYY_MM_DD'
    )
  ) IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    PERFORM realtime.send(
      jsonb_build_object('source', 'workspace'),
      'workspace-invalidated',
      topic,
      true
    );
  EXCEPTION WHEN OTHERS THEN
    -- Realtime outages must not roll back application data changes.
    RETURN;
  END;
END;
$$;

-- Read receipts are durable in public tables. Their synchronous database
-- triggers relied on realtime.messages partitions and sent invalidations to
-- every admin. The authenticated API now sends one scoped HTTP Broadcast after
-- each successful receipt write.
DROP TRIGGER IF EXISTS user_workspace_event_reads_insert_invalidation
  ON public.user_workspace_event_reads;
DROP TRIGGER IF EXISTS user_workspace_event_reads_update_invalidation
  ON public.user_workspace_event_reads;
DROP TRIGGER IF EXISTS user_workspace_event_reads_delete_invalidation
  ON public.user_workspace_event_reads;
DROP FUNCTION IF EXISTS private.broadcast_user_workspace_event_read_invalidation();

DROP TRIGGER IF EXISTS admin_workspace_event_reads_realtime_invalidation
  ON public.admin_workspace_event_reads;
DROP FUNCTION IF EXISTS private.broadcast_admin_workspace_event_read_invalidation();
