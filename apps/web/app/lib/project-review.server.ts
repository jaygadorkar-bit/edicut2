import { sql, type SQL } from "drizzle-orm";
import type { DatabaseClient } from "@edicut/db/client";
import type { LoaderFunctionArgs } from "react-router";
import { getDbFromContext } from "./db.server";
import { requireAdminUser } from "./session.server";
import { requireClientWorkspace } from "./client-workspace-access.server";
import { isWorkspaceRecordId, parseWorkspaceShareUrl } from "./workspace";
import {
  validateReviewComment,
  type ReviewActor,
  type ReviewComment,
  type ReviewData,
  type ReviewProject,
  type ReviewResult,
  type ReviewVersion,
  type ReviewEditorOption,
  type ReviewTeamMember,
} from "./project-review";

export const reviewRows = <T>(result: unknown): T[] =>
  (Array.isArray(result)
    ? result
    : ((result as { rows?: T[] })?.rows ?? [])) as T[];
export function isMissingReviewSchema(error: unknown): boolean {
  const seen = new Set<object>();
  let current = error;
  let context = false;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const item = current as {
      code?: string;
      message?: string;
      cause?: unknown;
    };
    context ||=
      /project_review_(members|versions|comments|uploads)|video_storage_connections/.test(
        item.message ?? "",
      );
    if (
      (context && item.code === "42P01") ||
      (item.code === "42703" &&
        /review_revision|v\.provider|v\.youtube_id|v\.drive_file_id|s\.provider|s\.drive_file_id/.test(item.message ?? ""))
    )
      return true;
    current = item.cause;
  }
  return false;
}
export async function requireReviewActor(
  args: Pick<LoaderFunctionArgs, "request" | "context">,
  admin: boolean,
) {
  if (admin) {
    const db = getDbFromContext(args.context);
    const user = await requireAdminUser(
      args.request,
      db,
      args.context,
      new URL(args.request.url).pathname,
    );
    return {
      db,
      actor: {
        id: user.id,
        key: `admin:${user.id}`,
        name: (user.name || "EdiCut team").slice(0, 120),
        role: "admin",
        admin: true,
      } satisfies ReviewActor,
      features: [] as string[],
    };
  }
  const { db, user, userId, features } = await requireClientWorkspace(args);
  if (!features.includes("reviews"))
    throw new Response("Reviews are not enabled for this account.", {
      status: 403,
    });
  return {
    db,
    actor: {
      id: userId,
      key: `user:${userId}`,
      name: (user.name || "Client").slice(0, 120),
      role: user.role,
      admin: false,
    } satisfies ReviewActor,
    features,
  };
}
/** Current DB permissions are checked again in every read/write, beyond the session. Alias p is always workspace_projects. */
export function projectReviewAccessSql(
  actor: ReviewActor,
  mode: "read" | "upload" | "decide" | "assign" = "read",
): SQL {
  if (actor.admin)
    return mode === "decide"
      ? sql`false`
      : sql`EXISTS (SELECT 1 FROM admin_users viewer WHERE viewer.id=${actor.id}::uuid AND viewer.active AND viewer.role='admin')`;
  const staff = ["editor", "project_manager"].includes(actor.role);
  const eligible =
    (mode === "upload" && !staff) ||
    (mode === "decide" && staff) ||
    (mode === "assign" && actor.role !== "project_manager")
      ? sql`false`
      : actor.role === "project_manager" && mode !== "upload"
        ? sql`true`
        : staff
          ? sql`EXISTS (SELECT 1 FROM project_review_members membership WHERE membership.project_id=p.id AND membership.user_id=${actor.id}::uuid)`
          : sql`p.owner_id=${actor.id}::uuid`;
  return sql`${eligible} AND EXISTS (SELECT 1 FROM users viewer WHERE viewer.id=${actor.id}::uuid AND viewer.active AND viewer.deleted_at IS NULL AND viewer.role=${actor.role})`;
}
const projectColumns = sql`p.id, p.owner_id AS "ownerId", p.title, p.channel_name AS "channelName", p.status, p.deadline, p.notes, p.updated_at AS "updatedAt"`;
const versionColumns = sql`v.id, v.project_id AS "projectId", v.title, v.note, v.author_name AS "authorName", v.actor_key AS "actorKey", v.duration_ms AS "durationMs", v.bytes::double precision AS bytes, v.mime, v.provider, v.youtube_id AS "youtubeId", v.decision, v.created_at AS "createdAt", v.updated_at AS "updatedAt"`;
export const canAssignReviewTeam = (actor: ReviewActor) =>
  actor.admin || actor.role === "project_manager";
export async function loadReviewEditorOptions(
  db: DatabaseClient,
): Promise<ReviewEditorOption[]> {
  return reviewRows<ReviewEditorOption>(
    await db.execute(sql`SELECT u.id,COALESCE(u.name,'Editor') AS name,u.role,
    (SELECT count(*)::integer FROM project_review_members m JOIN workspace_projects p ON p.id=m.project_id WHERE m.user_id=u.id AND p.status<>'delivered') AS "activeProjects"
    FROM users u WHERE u.active AND u.deleted_at IS NULL AND u.role='editor' ORDER BY "activeProjects",name,u.id LIMIT 200`),
  );
}
export async function loadReviewTeamSummaries(
  db: DatabaseClient,
  actor: ReviewActor,
  projectIds: string[],
) {
  if (!projectIds.length)
    return {} as Record<
      string,
      { members: ReviewTeamMember[]; revision: number }
    >;
  const ids = projectIds.filter(isWorkspaceRecordId);
  if (!ids.length)
    return {} as Record<
      string,
      { members: ReviewTeamMember[]; revision: number }
    >;
  const rows = reviewRows<{
    projectId: string;
    revision: number;
    members: ReviewTeamMember[];
  }>(
    await db.execute(sql`SELECT p.id AS "projectId",p.review_revision AS revision,
    COALESCE((SELECT json_agg(json_build_object('id',u.id,'name',COALESCE(u.name,'Editor'),'role',u.role) ORDER BY m.created_at,u.id) FROM project_review_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=p.id AND u.active AND u.deleted_at IS NULL),'[]'::json) AS members
    FROM workspace_projects p WHERE p.id IN (${sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`,`,
    )}) AND ${projectReviewAccessSql(actor)}`),
  );
  return Object.fromEntries(
    rows.map((row) => [
      row.projectId,
      { members: row.members, revision: row.revision },
    ]),
  );
}
const commentColumns = sql`c.id, c.version_id AS "versionId", c.parent_id AS "parentId", c.actor_key AS "actorKey", c.author_name AS "authorName", c.author_role AS "authorRole", c.body, c.timestamp_ms AS "timestampMs", c.end_ms AS "endMs", c.annotation, c.category, c.priority, c.resolved, c.created_at AS "createdAt", c.updated_at AS "updatedAt"`;
export async function findReviewProject(
  db: DatabaseClient,
  actor: ReviewActor,
  id: string,
) {
  if (!isWorkspaceRecordId(id))
    throw new Response("Project not found.", { status: 404 });
  // Owners/admins can still see their real project brief before the new schema is installed.
  const access = projectReviewAccessSql(actor);
  const project = reviewRows<ReviewProject>(
    await db.execute(
      sql`SELECT ${projectColumns} FROM workspace_projects p WHERE p.id=${id}::uuid AND ${access}`,
    ),
  )[0];
  if (!project) throw new Response("Project not found.", { status: 404 });
  return project;
}
export async function loadProjectReview(
  db: DatabaseClient,
  actor: ReviewActor,
  id: string,
  features: string[],
  versionId?: string | null,
): Promise<ReviewData & { selectedVersionId: string | null }> {
  const project = await findReviewProject(db, actor, id);
  const base = {
    project,
    actor,
    features,
    canUpload:
      actor.admin || ["editor", "project_manager"].includes(actor.role),
    canDecide:
      !actor.admin &&
      actor.id === project.ownerId &&
      !["editor", "project_manager"].includes(actor.role),
    canAssign: canAssignReviewTeam(actor),
  };
  const files = reviewRows<ReviewData["files"][number]>(
    await db.execute(
      sql`SELECT f.id,f.file_name AS "fileName",f.share_url AS "shareUrl",f.kind FROM workspace_project_files f JOIN workspace_projects p ON p.id=f.project_id WHERE p.id=${id}::uuid AND ${projectReviewAccessSql(actor)} ORDER BY f.created_at DESC LIMIT 100`,
    ),
  );
  try {
    const [versions, members, editorOptions, revision] = await Promise.all([
      db
        .execute(
          sql`SELECT ${versionColumns} FROM project_review_versions v JOIN workspace_projects p ON p.id=v.project_id WHERE p.id=${id}::uuid AND ${projectReviewAccessSql(actor)} ORDER BY v.created_at DESC,v.id DESC LIMIT 100`,
        )
        .then(reviewRows<ReviewVersion>),
      db
        .execute(
          sql`SELECT u.id,COALESCE(u.name,'Editor') AS name,u.role FROM project_review_members m JOIN users u ON u.id=m.user_id JOIN workspace_projects p ON p.id=m.project_id WHERE p.id=${id}::uuid AND ${projectReviewAccessSql(actor)} AND u.active AND u.deleted_at IS NULL AND u.role IN ('editor','project_manager') ORDER BY m.created_at,u.id LIMIT 50`,
        )
        .then(reviewRows<ReviewTeamMember>),
      canAssignReviewTeam(actor)
        ? loadReviewEditorOptions(db)
        : Promise.resolve([]),
      db
        .execute(
          sql`SELECT p.review_revision AS revision FROM workspace_projects p WHERE p.id=${id}::uuid AND ${projectReviewAccessSql(actor)}`,
        )
        .then(reviewRows<{ revision: number }>),
    ]);
    const selected = versionId
      ? versions.find((version) => version.id === versionId)
      : versions[0];
    if (versionId && !selected)
      throw new Response("Video version not found.", { status: 404 });
    const comments = selected
      ? reviewRows<ReviewComment>(
          await db.execute(
            sql`SELECT ${commentColumns} FROM project_review_comments c JOIN project_review_versions v ON v.id=c.version_id JOIN workspace_projects p ON p.id=v.project_id WHERE v.id=${selected.id}::uuid AND ${projectReviewAccessSql(actor)} ORDER BY c.created_at,c.id LIMIT 1000`,
          ),
        )
      : [];
    return {
      ...base,
      canUpload:
        actor.admin ||
        (base.canUpload && members.some((member) => member.id === actor.id)),
      project: { ...project, reviewRevision: revision[0]?.revision ?? 0 },
      files,
      versions,
      members,
      editorOptions,
      comments,
      ready: true,
      selectedVersionId: selected?.id ?? null,
    };
  } catch (error) {
    if (!isMissingReviewSchema(error)) throw error;
    return {
      ...base,
      files,
      versions: [],
      comments: [],
      members: [],
      editorOptions: [],
      ready: false,
      selectedVersionId: null,
    };
  }
}

export async function mutateProjectReview(
  db: DatabaseClient,
  actor: ReviewActor,
  projectId: string,
  form: FormData,
): Promise<ReviewResult> {
  const intent = String(form.get("intent") ?? "");
  if (intent === "set-editor") {
    if (!canAssignReviewTeam(actor))
      throw new Response(
        "Only an administrator or project manager can assign editors.",
        { status: 403 },
      );
    const userId = String(form.get("userId") ?? ""),
      revision = String(form.get("expectedRevision") ?? "");
    if (
      !isWorkspaceRecordId(userId) ||
      !/^\d+$/.test(revision) ||
      !Number.isSafeInteger(Number(revision))
    )
      return {
        error:
          "Choose an active editor and refresh the project before assigning.",
      };
    const result = await db.execute(sql`WITH eligible AS MATERIALIZED (
      SELECT p.id FROM workspace_projects p WHERE p.id=${projectId}::uuid AND p.review_revision=${Number(revision)} AND ${projectReviewAccessSql(actor, "assign")} FOR UPDATE
    ), chosen AS MATERIALIZED (SELECT u.id FROM users u WHERE u.id=${userId}::uuid AND u.active AND u.deleted_at IS NULL AND u.role='editor' AND EXISTS(SELECT 1 FROM eligible)),
    removed AS (DELETE FROM project_review_members m USING users u,eligible p WHERE m.project_id=p.id AND m.user_id=u.id AND u.role='editor' AND m.user_id<>${userId}::uuid AND EXISTS(SELECT 1 FROM chosen) RETURNING m.id),
    added AS (INSERT INTO project_review_members(project_id,user_id) SELECT p.id,u.id FROM eligible p CROSS JOIN chosen u ON CONFLICT(project_id,user_id) DO UPDATE SET user_id=excluded.user_id RETURNING project_id),
    touched AS (UPDATE workspace_projects p SET review_revision=review_revision+1,updated_at=clock_timestamp(),status=CASE WHEN status='intake' THEN 'editing' ELSE status END FROM added a WHERE p.id=a.project_id RETURNING p.id)
    SELECT id FROM touched`);
    return reviewRows(result).length
      ? {
          success:
            "Editor assigned. They can now open the project and upload review cuts.",
        }
      : {
          error:
            "The project changed or this editor is no longer available. Refresh and try again.",
        };
  }
  if (intent === "add-source") {
    const label = String(form.get("fileName") ?? "").trim(),
      url = parseWorkspaceShareUrl(String(form.get("shareUrl") ?? ""));
    if (!label || label.length > 160 || !url)
      return {
        error:
          "Add a file label and a valid HTTPS sharing link without embedded credentials.",
      };
    const result =
      await db.execute(sql`INSERT INTO workspace_project_files (project_id,owner_id,kind,file_name,share_url)
      SELECT p.id,p.owner_id,'source',${label},${url} FROM workspace_projects p WHERE p.id=${projectId}::uuid AND ${projectReviewAccessSql(actor)}
      AND (SELECT count(*) FROM workspace_project_files f WHERE f.project_id=p.id)<100 RETURNING id`);
    return reviewRows(result).length
      ? { success: "Source link attached to this project." }
      : { error: "Project access changed or the 100-file limit was reached." };
  }
  if (intent === "assign-editor" || intent === "remove-editor") {
    if (!actor.admin)
      throw new Response("Only an administrator can assign the project team.", {
        status: 403,
      });
    const userId = String(form.get("userId") ?? "");
    if (!isWorkspaceRecordId(userId))
      return { error: "Choose an editor from the list." };
    const result =
      intent === "assign-editor"
        ? await db.execute(sql`INSERT INTO project_review_members (project_id,user_id)
      SELECT p.id,u.id FROM workspace_projects p JOIN users u ON u.id=${userId}::uuid AND u.active AND u.deleted_at IS NULL AND u.role IN ('editor','project_manager')
      WHERE p.id=${projectId}::uuid AND ${projectReviewAccessSql(actor)} AND (SELECT count(*) FROM project_review_members m WHERE m.project_id=p.id)<50
      ON CONFLICT (project_id,user_id) DO NOTHING RETURNING id`)
        : await db.execute(
            sql`DELETE FROM project_review_members m USING workspace_projects p WHERE m.project_id=p.id AND p.id=${projectId}::uuid AND m.user_id=${userId}::uuid AND ${projectReviewAccessSql(actor)} RETURNING m.id`,
          );
    return reviewRows(result).length
      ? {
          success:
            intent === "assign-editor"
              ? "Editor added to this project."
              : "Editor removed from this project.",
        }
      : { error: "The team changed. Refresh and try again." };
  }
  const versionId = String(form.get("versionId") ?? "");
  if (!isWorkspaceRecordId(versionId))
    return { error: "Choose a video version first." };
  const version = reviewRows<ReviewVersion>(
    await db.execute(
      sql`SELECT ${versionColumns} FROM project_review_versions v JOIN workspace_projects p ON p.id=v.project_id WHERE v.id=${versionId}::uuid AND p.id=${projectId}::uuid AND ${projectReviewAccessSql(actor)}`,
    ),
  )[0];
  if (!version) throw new Response("Video version not found.", { status: 404 });
  if (intent === "add-comment") {
    const parsed = validateReviewComment(form, version.durationMs);
    if (!parsed.value) return { error: parsed.error };
    const commentId = String(form.get("commentId") ?? ""),
      parentId = String(form.get("parentId") ?? "");
    if (
      !isWorkspaceRecordId(commentId) ||
      (parentId && !isWorkspaceRecordId(parentId))
    )
      return { error: "Refresh the comment form and try again." };
    const value = parsed.value;
    const result = await db.execute(sql`WITH eligible AS MATERIALIZED (
      SELECT p.id FROM workspace_projects p WHERE p.id=${projectId}::uuid AND ${projectReviewAccessSql(actor)} FOR UPDATE
    ), writable AS MATERIALIZED (
      SELECT v.id FROM project_review_versions v JOIN eligible p ON p.id=v.project_id WHERE v.id=${versionId}::uuid AND v.decision<>'approved' FOR UPDATE OF v
    ), inserted AS (INSERT INTO project_review_comments (id,version_id,parent_id,actor_key,author_name,author_role,body,timestamp_ms,end_ms,annotation,category,priority)
      SELECT ${commentId}::uuid,v.id,${parentId || null}::uuid,${actor.key},${actor.name},${actor.role},${value.body},${parentId ? null : value.timestampMs},${parentId ? null : value.endMs},${parentId || !value.annotation ? null : JSON.stringify(value.annotation)}::jsonb,${value.category},${value.priority}
      FROM writable v WHERE (SELECT count(*) FROM project_review_comments c WHERE c.version_id=v.id)<1000
        AND (${!parentId} OR EXISTS (SELECT 1 FROM project_review_comments parent WHERE parent.id=${parentId || null}::uuid AND parent.version_id=v.id AND parent.parent_id IS NULL))
      ON CONFLICT (id) DO NOTHING RETURNING id
    ), touched AS (UPDATE workspace_projects p SET review_revision=review_revision+1,updated_at=clock_timestamp() FROM inserted c WHERE p.id=${projectId}::uuid RETURNING p.id)
    SELECT id FROM inserted`);
    if (reviewRows(result).length)
      return {
        success: parentId ? "Reply added." : "Comment added.",
        commentId,
      };
    const replay = reviewRows<{ body: string }>(
      await db.execute(
        sql`SELECT c.body FROM project_review_comments c JOIN project_review_versions v ON v.id=c.version_id JOIN workspace_projects p ON p.id=v.project_id WHERE c.id=${commentId}::uuid AND c.version_id=${versionId}::uuid AND c.actor_key=${actor.key} AND c.body=${value.body} AND c.parent_id IS NOT DISTINCT FROM ${parentId || null}::uuid AND c.timestamp_ms IS NOT DISTINCT FROM ${parentId ? null : value.timestampMs}::integer AND c.end_ms IS NOT DISTINCT FROM ${parentId ? null : value.endMs}::integer AND c.annotation IS NOT DISTINCT FROM ${parentId || !value.annotation ? null : JSON.stringify(value.annotation)}::jsonb AND c.category=${value.category} AND c.priority=${value.priority} AND p.id=${projectId}::uuid AND ${projectReviewAccessSql(actor)}`,
      ),
    );
    return replay.length
      ? { success: "Comment added.", commentId }
      : {
          error:
            "This version is approved, the thread changed, or the 1,000-comment limit was reached. Refresh before retrying.",
        };
  }
  if (intent === "resolve-comment") {
    const commentId = String(form.get("commentId") ?? ""),
      expected = String(form.get("expectedResolved") ?? "");
    if (
      !isWorkspaceRecordId(commentId) ||
      !["true", "false"].includes(expected)
    )
      return { error: "Choose a valid comment." };
    const result =
      await db.execute(sql`WITH eligible AS MATERIALIZED (SELECT p.id FROM workspace_projects p WHERE p.id=${projectId}::uuid AND ${projectReviewAccessSql(actor)} FOR UPDATE), writable AS MATERIALIZED (
      SELECT v.id FROM project_review_versions v JOIN eligible p ON p.id=v.project_id WHERE v.id=${versionId}::uuid AND v.decision<>'approved' FOR UPDATE OF v
    ), changed AS (
      UPDATE project_review_comments c SET resolved=${expected !== "true"},updated_at=clock_timestamp() FROM writable v
      WHERE c.id=${commentId}::uuid AND c.version_id=v.id
        AND c.parent_id IS NULL AND c.resolved=${expected === "true"} RETURNING c.id
    ), touched AS (UPDATE workspace_projects p SET review_revision=review_revision+1,updated_at=clock_timestamp() FROM changed c WHERE p.id=${projectId}::uuid RETURNING p.id)
    SELECT id FROM changed`);
    return reviewRows(result).length
      ? {
          success:
            expected === "true" ? "Comment reopened." : "Comment resolved.",
        }
      : { error: "This comment changed. Refresh and try again." };
  }
  if (intent === "review-decision") {
    const decision = String(form.get("decision") ?? ""),
      note = String(form.get("note") ?? "").trim();
    if (
      !["approved", "changes_requested"].includes(decision) ||
      note.length > 4000
    )
      return {
        error:
          "Choose a valid review decision and keep the note under 4,000 characters.",
      };
    const expectedRevision = String(form.get("expectedRevision") ?? "");
    if (
      !/^\d+$/.test(expectedRevision) ||
      !Number.isSafeInteger(Number(expectedRevision))
    )
      return { error: "Refresh the review before confirming a decision." };
    const result = await db.execute(sql`WITH eligible AS MATERIALIZED (
      SELECT p.id,p.owner_id FROM workspace_projects p WHERE p.id=${projectId}::uuid AND p.review_revision=${Number(expectedRevision)} AND ${projectReviewAccessSql(actor, "decide")} FOR UPDATE
    ), decided AS (
      UPDATE project_review_versions v SET decision=${decision},updated_at=clock_timestamp() FROM eligible p
      WHERE v.id=${versionId}::uuid AND v.project_id=p.id AND v.decision='pending'
        AND v.id=(SELECT latest.id FROM project_review_versions latest WHERE latest.project_id=p.id ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1)
        AND (${decision !== "approved"} OR NOT EXISTS (SELECT 1 FROM project_review_comments c WHERE c.version_id=v.id AND c.parent_id IS NULL AND NOT c.resolved AND c.category='change'))
        AND (${decision !== "changes_requested"} OR ${note.length > 0} OR EXISTS (SELECT 1 FROM project_review_comments c WHERE c.version_id=v.id AND c.parent_id IS NULL AND NOT c.resolved AND c.category='change'))
      RETURNING v.project_id
    ), updated AS (
      UPDATE workspace_projects p SET status=${decision === "approved" ? "delivered" : "revision"},review_revision=review_revision+1,updated_at=clock_timestamp() FROM decided d WHERE p.id=d.project_id RETURNING p.id,p.owner_id
    ) INSERT INTO workspace_project_reviews (project_id,owner_id,decision,feedback)
      SELECT id,owner_id,${decision === "approved" ? "approved" : "revision_requested"},${note || (decision === "approved" ? "Approved in video review." : "See timestamped comments in video review.")} FROM updated RETURNING id`);
    return reviewRows(result).length
      ? {
          success:
            decision === "approved"
              ? "Version approved. Your project is marked delivered."
              : "Changes requested. Your editor can see the feedback.",
        }
      : {
          error:
            "Only the client can review the latest pending version. Resolve open changes before approving, or add feedback when requesting changes.",
        };
  }
  return { error: "This review action is unavailable." };
}

export async function saveReviewVersion(
  db: DatabaseClient,
  actor: ReviewActor,
  projectId: string,
  media: {
    publicId: string;
    mime: string;
    bytes: number;
    durationMs: number;
      provider?: "cloudinary" | "youtube" | "google_drive";
    youtubeId?: string;
      driveFileId?: string;
  },
  title: string,
  note: string,
  id: string,
) {
  const result = await db.execute(sql`WITH eligible AS MATERIALIZED (
    SELECT p.id,p.owner_id FROM workspace_projects p WHERE p.id=${projectId}::uuid AND ${projectReviewAccessSql(actor, "upload")} FOR UPDATE
  ), inserted AS (
    INSERT INTO project_review_versions (id,project_id,actor_key,author_name,title,note,public_id,mime,bytes,duration_ms,provider,youtube_id,drive_file_id,created_at)
    SELECT ${id}::uuid,p.id,${actor.key},${actor.name},${title},${note},${media.publicId},${media.mime},${media.bytes},${media.durationMs},${media.provider ?? "cloudinary"},${media.youtubeId ?? null},${media.driveFileId ?? null},clock_timestamp() FROM eligible p
    WHERE (SELECT count(*) FROM project_review_versions v WHERE v.project_id=p.id)<100 RETURNING project_id
  ), updated AS (
    UPDATE workspace_projects p SET status='review',review_revision=review_revision+1,updated_at=clock_timestamp() FROM inserted v WHERE p.id=v.project_id RETURNING p.id,p.owner_id
  ) INSERT INTO workspace_project_files (owner_id,project_id,kind,file_name,share_url)
    SELECT owner_id,id,'review',${title},${`/dashboard/projects/${projectId}?version=${id}`} FROM updated RETURNING id`);
  return reviewRows(result).length ? id : null;
}

export async function loadAssignedProjects(
  db: DatabaseClient,
  actor: ReviewActor,
  query = "",
  view = "all",
  requestedPage = 1,
) {
  try {
    const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    const filter = sql`${projectReviewAccessSql(actor)} AND ${query ? sql`(p.title ILIKE ${pattern} OR p.channel_name ILIKE ${pattern})` : sql`true`} AND ${view === "unassigned" ? sql`p.status<>'delivered' AND NOT EXISTS(SELECT 1 FROM project_review_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=p.id AND u.active AND u.deleted_at IS NULL AND u.role='editor')` : view === "reviews" ? sql`p.status IN ('review','client_review')` : view === "delivered" ? sql`p.status='delivered'` : view === "active" ? sql`p.status<>'delivered'` : sql`true`}`;
    const count =
      reviewRows<{ total: number }>(
        await db.execute(
          sql`SELECT count(*)::integer AS total FROM workspace_projects p WHERE ${filter}`,
        ),
      )[0]?.total ?? 0;
    const pageCount = Math.max(1, Math.ceil(count / 25)),
      page = Math.min(requestedPage, pageCount);
    const projects = reviewRows<ReviewProject>(
      await db.execute(
        sql`SELECT ${projectColumns} FROM workspace_projects p WHERE ${filter} ORDER BY p.updated_at DESC LIMIT 25 OFFSET ${(page - 1) * 25}`,
      ),
    );
    return { projects, count, page, pageCount };
  } catch (error) {
    if (isMissingReviewSchema(error))
      return { projects: [], count: 0, page: 1, pageCount: 1 };
    throw error;
  }
}
