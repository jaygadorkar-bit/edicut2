-- Keep recipient variables distinct from SQL column names. Without this,
-- `m.project_id = project_id` is ambiguous when the trigger first runs.
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
