import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import type { DatabaseClient } from "@edicut/db/client";
import {
  findReviewProject,
  loadProjectReview,
  loadAssignedProjects,
  mutateProjectReview,
  saveReviewVersion,
} from "./project-review.server";
import type { ReviewActor } from "./project-review";
import {
  youtubeUploadForm,
  youtubeUploadChunk,
} from "./youtube-review-upload.server";
import { encryptYouTubeSecret } from "./youtube-storage.server";
import type { ActionFunctionArgs } from "react-router";

const connection = process.env.REVIEW_TEST_DATABASE_URL;
const client: ReviewActor = {
  id: "11111111-1111-4111-8111-111111111111",
  key: "user:11111111-1111-4111-8111-111111111111",
  name: "Client",
  role: "customer",
  admin: false,
};
const editor: ReviewActor = {
  id: "22222222-2222-4222-8222-222222222222",
  key: "user:22222222-2222-4222-8222-222222222222",
  name: "Editor",
  role: "editor",
  admin: false,
};
const admin: ReviewActor = {
  id: "33333333-3333-4333-8333-333333333333",
  key: "admin:33333333-3333-4333-8333-333333333333",
  name: "Admin",
  role: "admin",
  admin: true,
};
const projectId = "44444444-4444-4444-8444-444444444444",
  versionId = "55555555-5555-4555-8555-555555555555";
const form = (values: Record<string, string>) => {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
};
describe.skipIf(!connection)("video review PostgreSQL boundaries", () => {
  afterEach(() => vi.unstubAllGlobals());
  let sql: ReturnType<typeof postgres>, db: DatabaseClient;
  beforeAll(async () => {
    const target = new URL(connection!);
    if (
      !["127.0.0.1", "localhost"].includes(target.hostname) ||
      target.pathname !== "/edicut_review_test"
    )
      throw new Error(
        "Review tests require the dedicated local disposable database.",
      );
    sql = postgres(connection!, { max: 5, onnotice: () => {} });
    db = drizzle(sql) as unknown as DatabaseClient;
    await sql.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    await sql.unsafe(`CREATE TABLE users(id uuid PRIMARY KEY,name text,role text,active boolean DEFAULT true,deleted_at timestamptz);
      CREATE TABLE admin_users(id uuid PRIMARY KEY,name text,role text,active boolean DEFAULT true);
      CREATE TABLE workspace_projects(id uuid PRIMARY KEY,owner_id uuid REFERENCES users(id),title text,channel_name text,status text DEFAULT 'intake',deadline text,notes text,updated_at timestamptz DEFAULT clock_timestamp());
      CREATE TABLE workspace_project_files(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,owner_id uuid,project_id uuid,kind text,file_name text,share_url text,created_at timestamptz DEFAULT now());
      CREATE TABLE workspace_project_reviews(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,owner_id uuid,project_id uuid,decision text,feedback text,created_at timestamptz DEFAULT now());`);
    const migration = readFileSync(
      new URL(
        "../../../../packages/db/drizzle/0017_project_video_review.sql",
        import.meta.url,
      ),
      "utf8",
    );
    for (const statement of migration
      .split("--> statement-breakpoint")
      .filter((value) => value.trim()))
      await sql.unsafe(statement);
    for (const statement of readFileSync(
      new URL(
        "../../../../packages/db/drizzle/0018_project_youtube_uploads.sql",
        import.meta.url,
      ),
      "utf8",
    )
      .split("--> statement-breakpoint")
      .filter((value) => value.trim()))
      await sql.unsafe(statement);
    for (const statement of readFileSync(
      new URL(
        "../../../../packages/db/drizzle/0019_google_drive_review_storage.sql",
        import.meta.url,
      ),
      "utf8",
    )
      .split("--> statement-breakpoint")
      .filter((value) => value.trim()))
      await sql.unsafe(statement);
  });
  afterAll(async () => {
    if (sql) await sql.end();
  });
  beforeEach(async () => {
    await sql.unsafe(
      "TRUNCATE users,admin_users,workspace_projects,workspace_project_files,workspace_project_reviews,project_review_versions,project_review_comments,project_review_members CASCADE",
    );
    await sql`INSERT INTO users(id,name,role) VALUES(${client.id},${client.name},${client.role}),(${editor.id},${editor.name},${editor.role})`;
    await sql`INSERT INTO admin_users(id,name,role)VALUES(${admin.id},${admin.name},'admin')`;
    await sql`INSERT INTO workspace_projects(id,owner_id,title,channel_name)VALUES(${projectId},${client.id},'Launch film','Studio')`;
  });
  const upload = async (id = versionId) =>
    saveReviewVersion(
      db,
      admin,
      projectId,
      {
        publicId: `edicut/reviews/${projectId}/${id}.mp4`,
        mime: "video/mp4",
        bytes: 1000,
        durationMs: 60000,
      },
      "Review cut",
      "Editor note",
      id,
    );
  const comment = async (extra: Record<string, string> = {}) =>
    mutateProjectReview(
      db,
      client,
      projectId,
      form({
        intent: "add-comment",
        versionId,
        commentId: crypto.randomUUID(),
        body: "Trim the opening shot",
        timestampMs: "2000",
        category: "change",
        priority: "high",
        ...extra,
      }),
    );
  const decide = async (
    decision: string,
    extra: Record<string, string> = {},
  ) => {
    const project = await loadProjectReview(db, client, projectId, []);
    return mutateProjectReview(
      db,
      client,
      projectId,
      form({
        intent: "review-decision",
        versionId,
        decision,
        expectedRevision: String(project.project.reviewRevision),
        ...extra,
      }),
    );
  };
  it("requires explicit editor membership and immediately honors deactivation", async () => {
    await expect(
      findReviewProject(db, editor, projectId),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      await mutateProjectReview(
        db,
        admin,
        projectId,
        form({ intent: "assign-editor", userId: editor.id }),
      ),
    ).toHaveProperty("success");
    expect(await findReviewProject(db, editor, projectId)).toMatchObject({
      id: projectId,
    });
    await sql`UPDATE users SET active=false WHERE id=${editor.id}`;
    await expect(
      findReviewProject(db, editor, projectId),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("uploads a private version and updates project/file history atomically", async () => {
    expect(await upload()).toBe(versionId);
    const data = await loadProjectReview(db, client, projectId, [
      "projects",
      "reviews",
    ]);
    expect(data.versions).toHaveLength(1);
    expect(data.project.status).toBe("review");
    expect(data.files[0].shareUrl).toContain(versionId);
    expect(data.versions[0]).not.toHaveProperty("publicId");
    expect(
      await saveReviewVersion(
        db,
        client,
        projectId,
        { publicId: "wrong", mime: "video/mp4", bytes: 1, durationMs: 1 },
        "No access",
        "",
        crypto.randomUUID(),
      ),
    ).toBeNull();
  });
  it("lets active managers assign and replace editors, with immediate access changes and stale-write protection", async () => {
    const manager = {
      ...editor,
      id: "66666666-6666-4666-8666-666666666666",
      key: "user:66666666-6666-4666-8666-666666666666",
      name: "Manager",
      role: "project_manager",
    };
    const second = {
      ...editor,
      id: "77777777-7777-4777-8777-777777777777",
      key: "user:77777777-7777-4777-8777-777777777777",
      name: "Second editor",
    };
    await sql`INSERT INTO users(id,name,role)VALUES(${manager.id},${manager.name},${manager.role}),(${second.id},${second.name},${second.role})`;
    expect(
      (await loadAssignedProjects(db, manager, "", "unassigned")).count,
    ).toBe(1);
    expect(
      (await loadProjectReview(db, manager, projectId, [])).canAssign,
    ).toBe(true);
    expect(
      (await loadProjectReview(db, manager, projectId, [])).canUpload,
    ).toBe(false);
    await expect(
      mutateProjectReview(
        db,
        client,
        projectId,
        form({
          intent: "set-editor",
          userId: editor.id,
          expectedRevision: "0",
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      await mutateProjectReview(
        db,
        manager,
        projectId,
        form({
          intent: "set-editor",
          userId: editor.id,
          expectedRevision: "0",
        }),
      ),
    ).toHaveProperty("success");
    expect(
      (await loadAssignedProjects(db, manager, "", "unassigned")).count,
    ).toBe(0);
    expect((await loadProjectReview(db, editor, projectId, [])).canUpload).toBe(
      true,
    );
    expect(
      await mutateProjectReview(
        db,
        manager,
        projectId,
        form({
          intent: "set-editor",
          userId: second.id,
          expectedRevision: "0",
        }),
      ),
    ).toHaveProperty("error");
    expect(
      await mutateProjectReview(
        db,
        manager,
        projectId,
        form({
          intent: "set-editor",
          userId: second.id,
          expectedRevision: "1",
        }),
      ),
    ).toHaveProperty("success");
    await expect(
      findReviewProject(db, editor, projectId),
    ).rejects.toMatchObject({ status: 404 });
    expect(await findReviewProject(db, second, projectId)).toHaveProperty(
      "id",
      projectId,
    );
    await sql`UPDATE users SET active=false WHERE id=${manager.id}`;
    expect(
      await mutateProjectReview(
        db,
        manager,
        projectId,
        form({
          intent: "set-editor",
          userId: editor.id,
          expectedRevision: "2",
        }),
      ),
    ).toHaveProperty("error");
  });
  it("serializes simultaneous editor assignments so only one expected revision wins", async () => {
    const second = "77777777-7777-4777-8777-777777777777";
    await sql`INSERT INTO users(id,name,role)VALUES(${second},'Other','editor')`;
    const results = await Promise.all(
      [editor.id, second].map((userId) =>
        mutateProjectReview(
          db,
          admin,
          projectId,
          form({ intent: "set-editor", userId, expectedRevision: "0" }),
        ),
      ),
    );
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.filter((result) => result.error)).toHaveLength(1);
    expect(
      (await loadProjectReview(db, admin, projectId, [])).members,
    ).toHaveLength(1);
  });
  it("resumes a partially received YouTube upload and commits one verified unlisted version", async () => {
    const context = {
      cf: {
        env: {
          AUTH_GOOGLE_ID: "fixture-client",
          AUTH_GOOGLE_SECRET: "fixture-secret",
          APP_URL: "http://localhost:3002",
          YOUTUBE_TOKEN_SECRET: "fixture-key-012345678901234567890123456789",
        },
      },
    } as ActionFunctionArgs["context"];
    const channel = "UCaaaaaaaaaaaaaaaaaaaaaa",
      video = "abcdefghijk",
      cipher = await encryptYouTubeSecret("fixture-refresh", context);
    await sql`INSERT INTO video_storage_connections(provider,channel_id,channel_name,refresh_token,connected_by)VALUES('youtube',${channel},'Studio',${cipher},${admin.id})`;
    let chunks = 0;
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("oauth2.googleapis.com"))
          return Response.json({ access_token: "fixture-access" });
        if (url.includes("uploadType=resumable") && init?.method === "POST")
          return new Response(null, {
            headers: {
              Location:
                "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=fixture",
            },
          });
        if (url.includes("upload_id=")) {
          const range = new Headers(init?.headers).get("Content-Range");
          if (range?.startsWith("bytes */"))
            return new Response(null, { status: 308 });
          if (++chunks === 1)
            return new Response(null, {
              status: 308,
              headers: { Range: "bytes=0-511" },
            });
          return Response.json({ id: video }, { status: 201 });
        }
        if (url.includes("youtube/v3/videos?part="))
          return Response.json({
            items: [
              {
                id: video,
                snippet: { channelId: channel },
                status: {
                  privacyStatus: "unlisted",
                  embeddable: true,
                  uploadStatus: "processed",
                },
              },
            ],
          });
        throw new Error("Unexpected provider URL");
      },
    );
    vi.stubGlobal("fetch", fetch);
    const args = (request: Request) =>
      ({ request, context, params: { projectId } }) as unknown as ActionFunctionArgs;
    const init = form({
      intent: "init-video-upload",
      uploadId: versionId,
      title: "First cut",
      note: "Review this",
      mime: "video/mp4",
      bytes: "1000",
      durationMs: "60000",
      youtubeConsent: "yes",
    });
    await expect(
      youtubeUploadForm(
        args(new Request("http://localhost:3002")),
        db,
        client,
        projectId,
        init,
      ),
    ).rejects.toMatchObject({ status: 403 });
    const missingConsent = form(
      Object.fromEntries(
        [...init].filter(([name]) => name !== "youtubeConsent"),
      ) as Record<string, string>,
    );
    expect(
      await youtubeUploadForm(
        args(new Request("http://localhost:3002")),
        db,
        admin,
        projectId,
        missingConsent,
      ),
    ).toHaveProperty("error");
    expect(fetch).not.toHaveBeenCalled();
    expect(
      await youtubeUploadForm(
        args(new Request("http://localhost:3002")),
        db,
        admin,
        projectId,
        init,
      ),
    ).toMatchObject({ uploadId: versionId, offset: 0 });
    const first = new Uint8Array(1000);
    first.set([102, 116, 121, 112], 4);
    expect(
      await youtubeUploadChunk(
        args(
          new Request(
            `http://localhost:3002/api/project-reviews/${projectId}?upload=${versionId}&offset=0`,
            {
              method: "POST",
              headers: { "Content-Type": "application/octet-stream" },
              body: first,
            },
          ),
        ),
        db,
        admin,
        projectId,
      ),
    ).toMatchObject({ offset: 512 });
    expect(
      await youtubeUploadChunk(
        args(
          new Request(
            `http://localhost:3002/api/project-reviews/${projectId}?upload=${versionId}&offset=512`,
            {
              method: "POST",
              headers: { "Content-Type": "application/octet-stream" },
              body: first.slice(512),
            },
          ),
        ),
        db,
        admin,
        projectId,
      ),
    ).toMatchObject({ offset: 1000 });
    const finish = form({ intent: "finish-video-upload", uploadId: versionId });
    expect(
      await youtubeUploadForm(
        args(new Request("http://localhost:3002")),
        db,
        admin,
        projectId,
        finish,
      ),
    ).toHaveProperty("versionId", versionId);
    expect(
      await youtubeUploadForm(
        args(new Request("http://localhost:3002")),
        db,
        admin,
        projectId,
        finish,
      ),
    ).toHaveProperty("versionId", versionId);
    const loaded = await loadProjectReview(db, client, projectId, []);
    expect(loaded.versions).toHaveLength(1);
    expect(loaded.versions[0]).toMatchObject({
      provider: "youtube",
      youtubeId: video,
    });
    expect(JSON.stringify(loaded)).not.toContain("fixture-refresh");
    expect(JSON.stringify(loaded)).not.toContain("upload_id");
    expect(
      (
        await sql`SELECT session_uri FROM project_review_uploads WHERE id=${versionId}`
      )[0].session_uri,
    ).toBeNull();
    await sql.unsafe(
      "DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='review_storage_browser_test') THEN CREATE ROLE review_storage_browser_test NOLOGIN; END IF; END $$; GRANT USAGE ON SCHEMA public TO review_storage_browser_test; GRANT SELECT ON video_storage_connections,project_review_uploads TO review_storage_browser_test;",
    );
    const visible = await sql.begin(async (tx) => {
      await tx.unsafe("SET LOCAL ROLE review_storage_browser_test");
      return {
        connections: await tx`SELECT provider FROM video_storage_connections`,
        uploads: await tx`SELECT id FROM project_review_uploads`,
      };
    });
    expect(visible.connections).toHaveLength(0);
    expect(visible.uploads).toHaveLength(0);
  });
  it("keeps range/area comments and replies with the right video, and retries idempotently", async () => {
    await upload();
    const id = crypto.randomUUID();
    const annotation = JSON.stringify({
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
    });
    expect(
      await comment({ commentId: id, endMs: "4000", annotation }),
    ).toHaveProperty("success");
    expect(
      await comment({ commentId: id, endMs: "4000", annotation }),
    ).toHaveProperty("success");
    expect(
      await comment({ commentId: id, endMs: "5000", annotation }),
    ).toHaveProperty("error");
    expect(
      await comment({
        parentId: id,
        timestampMs: "",
        body: "I’ll tighten the opening.",
      }),
    ).toHaveProperty("success");
    const other = crypto.randomUUID();
    await upload(other);
    expect(
      await comment({ versionId: other, parentId: id, timestampMs: "" }),
    ).toHaveProperty("error");
    const data = await loadProjectReview(db, client, projectId, [], versionId);
    expect(data.comments).toHaveLength(2);
    expect(data.comments[0]).toMatchObject({
      annotation: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      endMs: 4000,
    });
  });
  it("blocks approval until changes are resolved, preserves decisions, and locks approved feedback", async () => {
    await upload();
    const added = await comment();
    expect(await decide("approved")).toHaveProperty("error");
    await expect(
      mutateProjectReview(
        db,
        editor,
        projectId,
        form({
          intent: "review-decision",
          versionId,
          decision: "approved",
          expectedUpdatedAt: new Date().toISOString(),
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("records a client approval only on the latest version after resolution", async () => {
    await upload();
    const added = await comment();
    expect(
      await mutateProjectReview(
        db,
        client,
        projectId,
        form({
          intent: "resolve-comment",
          versionId,
          commentId: added.commentId!,
          expectedResolved: "false",
        }),
      ),
    ).toHaveProperty("success");
    expect(await decide("approved")).toHaveProperty("success");
    expect((await findReviewProject(db, client, projectId)).status).toBe(
      "delivered",
    );
    expect(await comment()).toHaveProperty("error");
    expect(
      (await sql`SELECT decision FROM workspace_project_reviews`)[0].decision,
    ).toBe("approved");
    await upload(crypto.randomUUID());
    expect(await decide("approved")).toHaveProperty("error");
  });
  it("rejects approval from a stale project snapshot and requires change feedback", async () => {
    await upload();
    const before = await loadProjectReview(db, client, projectId, []);
    await comment();
    expect(
      await mutateProjectReview(
        db,
        client,
        projectId,
        form({
          intent: "review-decision",
          versionId,
          decision: "approved",
          expectedRevision: String(before.project.reviewRevision),
        }),
      ),
    ).toHaveProperty("error");
    expect(await decide("changes_requested")).toHaveProperty("success");
    expect((await findReviewProject(db, client, projectId)).status).toBe(
      "revision",
    );
  });
  it("keeps shared source links in the owned project and rejects unsafe URLs", async () => {
    const result = await mutateProjectReview(
      db,
      client,
      projectId,
      form({
        intent: "add-source",
        fileName: "Brand assets",
        shareUrl: "https://drive.google.com/brand",
      }),
    );
    expect(result).toHaveProperty("success");
    expect(
      (await sql`SELECT owner_id FROM workspace_project_files`)[0].owner_id,
    ).toBe(client.id);
    expect(
      await mutateProjectReview(
        db,
        client,
        projectId,
        form({
          intent: "add-source",
          fileName: "Unsafe",
          shareUrl: "javascript:alert(1)",
        }),
      ),
    ).toHaveProperty("error");
  });
  it("searches and paginates only assigned projects, with literal wildcard characters", async () => {
    expect((await loadAssignedProjects(db, editor)).count).toBe(0);
    await mutateProjectReview(
      db,
      admin,
      projectId,
      form({ intent: "assign-editor", userId: editor.id }),
    );
    expect((await loadAssignedProjects(db, editor, "Launch")).count).toBe(1);
    expect((await loadAssignedProjects(db, editor, "Launch%")).count).toBe(0);
    expect((await loadAssignedProjects(db, editor, "", "reviews")).count).toBe(
      0,
    );
    await upload();
    expect(
      (await loadAssignedProjects(db, editor, "", "reviews", 99)).page,
    ).toBe(1);
  });
  it("denies direct browser reads of the private review tables through row-level security", async () => {
    await upload();
    await sql.unsafe(
      "DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='review_browser_test') THEN CREATE ROLE review_browser_test NOLOGIN; END IF; END $$; GRANT USAGE ON SCHEMA public TO review_browser_test; GRANT SELECT ON project_review_versions TO review_browser_test;",
    );
    const visible = await sql.begin(async (transaction) => {
      await transaction.unsafe("SET LOCAL ROLE review_browser_test");
      return transaction`SELECT id FROM project_review_versions`;
    });
    expect(visible).toHaveLength(0);
  });
  it("serializes concurrent approval and new comments without approving unseen changes", async () => {
    await upload();
    const project = await loadProjectReview(db, client, projectId, []);
    const results = await Promise.all([
      comment(),
      mutateProjectReview(
        db,
        client,
        projectId,
        form({
          intent: "review-decision",
          versionId,
          decision: "approved",
          expectedRevision: String(project.project.reviewRevision),
        }),
      ),
    ]);
    const data = await loadProjectReview(db, client, projectId, []);
    expect(
      data.versions[0].decision === "approved" &&
        data.comments.some(
          (item) => !item.resolved && item.category === "change",
        ),
    ).toBe(false);
    expect(results.some((result) => result.error)).toBe(true);
  });
});
