import { test } from "node:test";
import assert from "node:assert/strict";
import { getAuthSessionMigrationPlan, readAuthSessionMigrations, verifyAuthSessionTarget } from "./migrate-auth-sessions.mjs";

const migrations = readAuthSessionMigrations();
const history = migrations.map(item => ({ hash: item.hash, created_at: item.when }));
const connection = "postgresql://test:private-password@localhost:55443/disposable";

test("preview is read-only and only the auth migration can be pending", () => {
  const authIndex = migrations.findIndex(item => item.tag === "0015_auth_session_revocation");
  assert.ok(authIndex > 0, "The auth migration must follow existing migrations");
  const authMigrations = migrations.slice(0, authIndex + 1);
  const priorHistory = history.slice(0, authIndex);
  assert.deepEqual(getAuthSessionMigrationPlan(priorHistory, authMigrations).map(item => item.tag), ["0015_auth_session_revocation"]);
  assert.deepEqual(getAuthSessionMigrationPlan(history, migrations), []);
  assert.throws(() => getAuthSessionMigrationPlan(priorHistory.slice(0, -1), authMigrations), /unrelated migration/);
  assert.throws(() => getAuthSessionMigrationPlan(priorHistory, [...authMigrations, { tag: "later_unrelated", hash: "later-unrelated-fixture", when: authMigrations.at(-1).when + 1 }]), /unrelated migration/);
});

test("changed or unrecognized migration history is rejected", () => {
  assert.throws(() => getAuthSessionMigrationPlan([...history, { hash: "unknown", created_at: 1 }], migrations), /history differs/);
  assert.throws(() => getAuthSessionMigrationPlan([{ ...history[0], created_at: 1 }], migrations), /history differs/);
});

test("apply requires both exact target names and never reports credentials", () => {
  for (const options of [{ apply: true }, { apply: true, "expected-host": "other", "expected-database": "disposable" }, { apply: true, "expected-host": "localhost", "expected-database": "other" }]) {
    assert.throws(() => verifyAuthSessionTarget(connection, options), /exact --expected-host and --expected-database/);
  }
  assert.deepEqual(verifyAuthSessionTarget(connection, { apply: true, "expected-host": "localhost", "expected-database": "disposable" }), { host: "localhost", database: "disposable" });
  assert.deepEqual(verifyAuthSessionTarget(connection, {}), { host: "localhost", database: "disposable" });
});

test("the migration only adds the two required revocation columns", () => {
  const auth = migrations.find(item => item.tag === "0015_auth_session_revocation");
  assert.equal(auth.statements.length, 2);
  for (const statement of auth.statements) {
    assert.match(statement, /^ALTER TABLE "(?:users|admin_users)" ADD COLUMN IF NOT EXISTS "session_version" uuid DEFAULT gen_random_uuid\(\) NOT NULL;$/);
  }
});
