-- Send private, content-free invalidation hints to active workspace accounts.
-- Clients must still read all notification and navigation data through the
-- existing cookie-authenticated application routes.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.can_receive_edicut_workspace_broadcast()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested_topic text := (SELECT realtime.topic());
  token_email text := lower(btrim(COALESCE((SELECT auth.jwt()) ->> 'email', '')));
BEGIN
  IF (SELECT auth.uid()) IS NULL OR token_email = '' OR requested_topic IS NULL THEN
    RETURN false;
  END IF;

  IF requested_topic LIKE 'edicut:user:%' THEN
    RETURN COALESCE((
      SELECT count(*) = 1 AND bool_or('edicut:user:' || u.id::text = requested_topic)
      FROM public.users AS u
      WHERE lower(btrim(u.email)) = token_email
        AND u.active
        AND u.deleted_at IS NULL
    ), false);
  END IF;

  IF requested_topic LIKE 'edicut:admin:%' THEN
    RETURN COALESCE((
      SELECT count(*) = 1 AND bool_or('edicut:admin:' || a.id::text = requested_topic)
      FROM public.admin_users AS a
      WHERE lower(btrim(a.email)) = token_email
        AND a.active
        AND a.role = 'admin'
    ), false);
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION private.can_receive_edicut_workspace_broadcast()
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION private.can_receive_edicut_workspace_broadcast()
  TO authenticated;

DROP POLICY IF EXISTS "EdiCut users receive their workspace invalidations"
  ON realtime.messages;
CREATE POLICY "EdiCut users receive their workspace invalidations"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND (SELECT private.can_receive_edicut_workspace_broadcast())
  );

DROP POLICY IF EXISTS "EdiCut workspace broadcast scope is enforced"
  ON realtime.messages;
CREATE POLICY "EdiCut workspace broadcast scope is enforced"
  ON realtime.messages
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND (SELECT private.can_receive_edicut_workspace_broadcast())
  );

-- Realtime failures must never roll back an application write. The trigger
-- publishes no row values, file ids, message text, or project titles.
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

  BEGIN
    PERFORM realtime.send(
      jsonb_build_object('source', 'workspace'),
      'workspace-invalidated',
      topic,
      true
    );
  EXCEPTION WHEN OTHERS THEN
    -- A missing daily Realtime partition or a transient service issue must not
    -- make otherwise valid database writes fail. Connected clients resync on
    -- reconnect, and unsupported sessions retain the HTTP fallback.
    RETURN;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION private.broadcast_edicut_workspace_invalidation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  changed_row jsonb;
  target_owner_id uuid;
  target_project_id uuid;
  target_direct_user_id uuid;
  should_notify_admins boolean := false;
  recipient_id uuid;
  target_admin_id uuid;
BEGIN
  changed_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;

  CASE TG_TABLE_NAME
    WHEN 'workspace_projects' THEN
      target_owner_id := nullif(changed_row ->> 'owner_id', '')::uuid;
      target_project_id := nullif(changed_row ->> 'id', '')::uuid;
      should_notify_admins := true;
    WHEN 'project_review_members' THEN
      target_project_id := nullif(changed_row ->> 'project_id', '')::uuid;
      target_direct_user_id := nullif(changed_row ->> 'user_id', '')::uuid;
      should_notify_admins := true;
    WHEN 'project_review_versions' THEN
      target_project_id := nullif(changed_row ->> 'project_id', '')::uuid;
      should_notify_admins := true;
    WHEN 'project_review_comments' THEN
      SELECT v.project_id INTO target_project_id
      FROM public.project_review_versions AS v
      WHERE v.id = nullif(changed_row ->> 'version_id', '')::uuid;
      should_notify_admins := true;
    WHEN 'workspace_project_reviews' THEN
      target_project_id := nullif(changed_row ->> 'project_id', '')::uuid;
      target_owner_id := nullif(changed_row ->> 'owner_id', '')::uuid;
      should_notify_admins := true;
    WHEN 'customer_subscriptions' THEN
      target_owner_id := nullif(changed_row ->> 'owner_id', '')::uuid;
      should_notify_admins := true;
    WHEN 'custom_quotes' THEN
      should_notify_admins := true;
    WHEN 'contact_messages' THEN
      should_notify_admins := true;
    ELSE
      RETURN NULL;
  END CASE;

  IF target_project_id IS NOT NULL AND target_owner_id IS NULL THEN
    SELECT p.owner_id INTO target_owner_id
    FROM public.workspace_projects AS p
    WHERE p.id = target_project_id;
  END IF;

  IF target_owner_id IS NOT NULL THEN
    PERFORM private.send_edicut_workspace_invalidation('edicut:user:' || target_owner_id::text);
  END IF;

  IF target_direct_user_id IS NOT NULL AND target_direct_user_id IS DISTINCT FROM target_owner_id THEN
    PERFORM private.send_edicut_workspace_invalidation('edicut:user:' || target_direct_user_id::text);
  END IF;

  IF target_project_id IS NOT NULL THEN
    FOR recipient_id IN
      SELECT DISTINCT recipients.user_id
      FROM (
        SELECT m.user_id
        FROM public.project_review_members AS m
        WHERE m.project_id = target_project_id
        UNION ALL
        SELECT u.id AS user_id
        FROM public.users AS u
        WHERE u.active AND u.deleted_at IS NULL AND u.role = 'project_manager'
      ) AS recipients
      WHERE recipients.user_id IS DISTINCT FROM target_owner_id
        AND recipients.user_id IS DISTINCT FROM target_direct_user_id
    LOOP
      PERFORM private.send_edicut_workspace_invalidation('edicut:user:' || recipient_id::text);
    END LOOP;
  END IF;

  IF TG_TABLE_NAME = 'contact_messages' THEN
    FOR recipient_id IN
      SELECT u.id
      FROM public.users AS u
      WHERE u.active AND u.deleted_at IS NULL AND u.role IN ('customer_support', 'project_manager')
    LOOP
      PERFORM private.send_edicut_workspace_invalidation('edicut:user:' || recipient_id::text);
    END LOOP;
  END IF;

  IF should_notify_admins THEN
    FOR target_admin_id IN
      SELECT a.id
      FROM public.admin_users AS a
      WHERE a.active AND a.role = 'admin'
    LOOP
      PERFORM private.send_edicut_workspace_invalidation('edicut:admin:' || target_admin_id::text);
    END LOOP;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.send_edicut_workspace_invalidation(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.broadcast_edicut_workspace_invalidation()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS workspace_projects_realtime_invalidation
  ON public.workspace_projects;
CREATE TRIGGER workspace_projects_realtime_invalidation
  AFTER INSERT OR UPDATE OR DELETE ON public.workspace_projects
  FOR EACH ROW EXECUTE FUNCTION private.broadcast_edicut_workspace_invalidation();

DROP TRIGGER IF EXISTS project_review_members_realtime_invalidation
  ON public.project_review_members;
CREATE TRIGGER project_review_members_realtime_invalidation
  AFTER INSERT OR UPDATE OR DELETE ON public.project_review_members
  FOR EACH ROW EXECUTE FUNCTION private.broadcast_edicut_workspace_invalidation();

DROP TRIGGER IF EXISTS project_review_versions_realtime_invalidation
  ON public.project_review_versions;
CREATE TRIGGER project_review_versions_realtime_invalidation
  AFTER INSERT OR UPDATE OR DELETE ON public.project_review_versions
  FOR EACH ROW EXECUTE FUNCTION private.broadcast_edicut_workspace_invalidation();

DROP TRIGGER IF EXISTS project_review_comments_realtime_invalidation
  ON public.project_review_comments;
CREATE TRIGGER project_review_comments_realtime_invalidation
  AFTER INSERT OR UPDATE OR DELETE ON public.project_review_comments
  FOR EACH ROW EXECUTE FUNCTION private.broadcast_edicut_workspace_invalidation();

DROP TRIGGER IF EXISTS workspace_project_reviews_realtime_invalidation
  ON public.workspace_project_reviews;
CREATE TRIGGER workspace_project_reviews_realtime_invalidation
  AFTER INSERT OR UPDATE OR DELETE ON public.workspace_project_reviews
  FOR EACH ROW EXECUTE FUNCTION private.broadcast_edicut_workspace_invalidation();

DROP TRIGGER IF EXISTS customer_subscriptions_realtime_invalidation
  ON public.customer_subscriptions;
CREATE TRIGGER customer_subscriptions_realtime_invalidation
  AFTER INSERT OR UPDATE OR DELETE ON public.customer_subscriptions
  FOR EACH ROW EXECUTE FUNCTION private.broadcast_edicut_workspace_invalidation();

DROP TRIGGER IF EXISTS custom_quotes_realtime_invalidation
  ON public.custom_quotes;
CREATE TRIGGER custom_quotes_realtime_invalidation
  AFTER INSERT OR UPDATE OR DELETE ON public.custom_quotes
  FOR EACH ROW EXECUTE FUNCTION private.broadcast_edicut_workspace_invalidation();

DROP TRIGGER IF EXISTS contact_messages_realtime_invalidation
  ON public.contact_messages;
CREATE TRIGGER contact_messages_realtime_invalidation
  AFTER INSERT OR UPDATE OR DELETE ON public.contact_messages
  FOR EACH ROW EXECUTE FUNCTION private.broadcast_edicut_workspace_invalidation();
