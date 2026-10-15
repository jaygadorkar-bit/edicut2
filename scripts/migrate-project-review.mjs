// Read-only unless --apply and an exact database target are explicitly supplied.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
class MigrationSafetyError extends Error {}
const allowed = [
  "0016_project_intake_pending_hours",
  "0017_project_video_review",
  "0018_project_youtube_uploads",
  "0019_google_drive_review_storage",
];
export function projectReviewMigrationPlan(applied, migrations) {
  if (
    applied.some(
      (row) =>
        !migrations.some(
          (item) =>
            item.hash === row.hash &&
            String(item.when) === String(row.created_at),
        ),
    )
  )
    throw new MigrationSafetyError(
      "Migration history differs from this checkout. Inspect before applying.",
    );
  if (allowed.some((tag) => !migrations.some((item) => item.tag === tag)))
    throw new MigrationSafetyError(
      "Project migrations are missing from this checkout.",
    );
  const pending = migrations.filter(
    (item) => !applied.some((row) => row.hash === item.hash),
  );
  if (pending.some((item) => !allowed.includes(item.tag)))
    throw new MigrationSafetyError(
      "An unrelated migration is pending. Apply it separately first.",
    );
  if (
    pending.some((item) =>
      applied.some((row) => Number(row.created_at) > item.when),
    )
  )
    throw new MigrationSafetyError(
      "A migration-history gap needs manual review.",
    );
  return pending;
}
export async function migrateProjectReview(connection, options = {}) {
  if (!connection) throw new MigrationSafetyError("DATABASE_URL is required.");
  const target = new URL(connection);
  if (!["postgres:", "postgresql:"].includes(target.protocol))
    throw new MigrationSafetyError("A PostgreSQL database is required.");
  if (
    options.apply &&
    (options["expected-host"] !== target.hostname ||
      options["expected-database"] !== target.pathname.slice(1))
  )
    throw new MigrationSafetyError(
      "Applying requires an exact --expected-host and --expected-database match.",
    );
  const directory = new URL("../packages/db/drizzle/", import.meta.url);
  const journal = JSON.parse(
    readFileSync(new URL("meta/_journal.json", directory), "utf8"),
  );
  const migrations = journal.entries.map((entry) => {
    const source = readFileSync(new URL(`${entry.tag}.sql`, directory), "utf8");
    return {
      ...entry,
      hash: createHash("sha256").update(source).digest("hex"),
      statements: source
        .split("--> statement-breakpoint")
        .map((part) => part.trim())
        .filter(Boolean),
    };
  });
  const sql = postgres(connection, {
    max: 1,
    connect_timeout: 10,
    connection: { statement_timeout: 30000, lock_timeout: 5000 },
  });
  const inspect = async (tx) => {
    const pending = projectReviewMigrationPlan(
      await tx`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`,
      migrations,
    );
    const checks =
      await tx`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.project_intakes'::regclass AND conname='project_intakes_reserved_check'`;
    if (
      checks.length !== 1 ||
      !checks[0].definition.includes(
        pending.some((item) => item.tag === allowed[0])
          ? "reserved_units > 0"
          : "reserved_units >= 0",
      )
    )
      throw new MigrationSafetyError(
        "Reservation constraint differs from migration history.",
      );
    const tables =
      await tx`SELECT relname,relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('project_review_members','project_review_versions','project_review_comments')`;
    const columns =
      await tx`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='workspace_projects' AND column_name='review_revision'`;
    const needsReview = pending.some((item) => item.tag === allowed[1]);
    if (
      needsReview
        ? tables.length !== 0 || columns.length !== 0
        : tables.length !== 3 ||
          tables.some((table) => !table.relrowsecurity) ||
          columns.length !== 1
    )
      throw new MigrationSafetyError(
        "Review schema differs from migration history. Inspect before applying.",
      );
    const uploadTables =
      await tx`SELECT relname,relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('project_review_uploads','video_storage_connections')`;
    const uploadColumns =
      await tx`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='project_review_versions' AND column_name IN ('provider','youtube_id','drive_file_id')`;
    const needsUploads = pending.some((item) => item.tag === allowed[2]);
    const needsDrive = pending.some((item) => item.tag === allowed[3]);
    if (
      needsUploads
        ? uploadTables.length !== 0 || uploadColumns.length !== 0
        : uploadTables.length !== 2 ||
          uploadTables.some((table) => !table.relrowsecurity) ||
          uploadColumns.length !== (needsDrive ? 2 : 3)
    )
      throw new MigrationSafetyError(
        "Video storage schema differs from migration history. Inspect before applying.",
      );
    const driveColumns = await tx`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND ((table_name='project_review_uploads' AND column_name IN ('provider','drive_file_id')) OR (table_name='project_review_versions' AND column_name='drive_file_id'))`;
    if (driveColumns.length !== (needsUploads || needsDrive ? 0 : 3))
      throw new MigrationSafetyError(
        "Google Drive review schema differs from migration history. Inspect before applying.",
      );
    return pending;
  };
  try {
    if (!options.apply)
      return {
        host: target.hostname,
        database: target.pathname.slice(1),
        apply: false,
        pending: (await inspect(sql)).map((item) => item.tag),
      };
    return await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(1790989172)`;
      const pending = await inspect(tx);
      for (const migration of pending) {
        for (const statement of migration.statements)
          await tx.unsafe(statement);
        await tx`INSERT INTO drizzle.__drizzle_migrations(hash,created_at)VALUES(${migration.hash},${migration.when})`;
      }
      await inspect(tx);
      return {
        host: target.hostname,
        database: target.pathname.slice(1),
        apply: true,
        applied: pending.map((item) => item.tag),
      };
    });
  } finally {
    await sql.end();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const { values } = parseArgs({
      options: {
        apply: { type: "boolean", default: false },
        "expected-host": { type: "string" },
        "expected-database": { type: "string" },
      },
    });
    console.log(
      JSON.stringify(
        await migrateProjectReview(process.env.DATABASE_URL, values),
      ),
    );
  } catch (error) {
    console.error(
      error instanceof MigrationSafetyError
        ? error.message
        : "Project review migration failed. Inspect the connection and schema privately.",
    );
    process.exitCode = 1;
  }
}
