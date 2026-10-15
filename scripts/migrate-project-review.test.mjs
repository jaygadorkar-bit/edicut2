import { test } from "node:test";
import assert from "node:assert/strict";
import {
  migrateProjectReview,
  projectReviewMigrationPlan,
} from "./migrate-project-review.mjs";
const migrations = [
  { tag: "0015_auth_session_revocation", hash: "prior", when: 1 },
  { tag: "0016_project_intake_pending_hours", hash: "hours", when: 2 },
  { tag: "0017_project_video_review", hash: "review", when: 3 },
  { tag: "0018_project_youtube_uploads", hash: "youtube", when: 4 },
  { tag: "0019_google_drive_review_storage", hash: "drive", when: 5 },
];
test("limits pending work to the project review migrations and rejects history gaps", () => {
  assert.deepEqual(
    projectReviewMigrationPlan([{ hash: "prior", created_at: 1 }], migrations),
    migrations.slice(1),
  );
  assert.deepEqual(
    projectReviewMigrationPlan(
      migrations.map((item) => ({ hash: item.hash, created_at: item.when })),
      migrations,
    ),
    [],
  );
  assert.throws(() => projectReviewMigrationPlan([], migrations), /unrelated/);
  assert.throws(
    () =>
      projectReviewMigrationPlan(
        [{ hash: "unknown", created_at: 0 }],
        migrations,
      ),
    /differs/,
  );
  assert.throws(
    () =>
      projectReviewMigrationPlan(
        [
          { hash: "prior", created_at: 1 },
          { hash: "review", created_at: 3 },
        ],
        migrations,
      ),
    /gap/,
  );
});
test("refuses to connect for an unconfirmed apply target", async () => {
  await assert.rejects(
    migrateProjectReview("postgres://example.invalid/neondb", { apply: true }),
    /exact/,
  );
});
