import { test } from "node:test";
import assert from "node:assert/strict";
import { migrateProjectPendingHours, pendingHoursMigrationPlan } from "./migrate-project-pending-hours.mjs";

const previous = { tag: "0015_auth_session_revocation", hash: "previous", when: 1 };
const current = { tag: "0016_project_intake_pending_hours", hash: "current", when: 2 };
test("applies only the pending-hours migration after known migrations", () => {
  assert.deepEqual(pendingHoursMigrationPlan([{ hash: "previous", created_at: 1 }], [previous, current]), [current]);
  assert.deepEqual(pendingHoursMigrationPlan([{ hash: "previous", created_at: 1 }, { hash: "current", created_at: 2 }], [previous, current]), []);
  assert.throws(() => pendingHoursMigrationPlan([], [previous, current]), /unrelated/);
  assert.throws(() => pendingHoursMigrationPlan([{ hash: "unknown", created_at: 1 }], [current]), /differs/);
});
test("rejects applying to an unconfirmed target before opening a connection", async () => {
  await assert.rejects(migrateProjectPendingHours("postgres://example.invalid/test", { apply: true }), /exact/);
  await assert.rejects(migrateProjectPendingHours(undefined), /required/);
});
