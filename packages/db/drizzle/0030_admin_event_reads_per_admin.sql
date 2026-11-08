-- Each admin keeps an independent receipt for each event. Older releases
-- stored one shared receipt per event; preserve that state for every admin.
CREATE TEMP TABLE "admin_workspace_event_reads_legacy_unowned" AS
SELECT "event_id", "is_read", "read_at", "updated_at"
FROM "admin_workspace_event_reads"
WHERE "read_by" IS NULL;
--> statement-breakpoint
DELETE FROM "admin_workspace_event_reads" WHERE "read_by" IS NULL;
--> statement-breakpoint
ALTER TABLE "admin_workspace_event_reads" DROP CONSTRAINT IF EXISTS "admin_workspace_event_reads_pkey";
--> statement-breakpoint
ALTER TABLE "admin_workspace_event_reads" DROP CONSTRAINT IF EXISTS "admin_workspace_event_reads_read_by_admin_users_id_fk";
--> statement-breakpoint
ALTER TABLE "admin_workspace_event_reads" DROP CONSTRAINT IF EXISTS "admin_workspace_event_reads_read_by_fkey";
--> statement-breakpoint
ALTER TABLE "admin_workspace_event_reads" ALTER COLUMN "read_by" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "admin_workspace_event_reads"
  ADD CONSTRAINT "admin_workspace_event_reads_read_by_admin_users_id_fk"
  FOREIGN KEY ("read_by") REFERENCES "admin_users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "admin_workspace_event_reads"
  ADD CONSTRAINT "admin_workspace_event_reads_pkey" PRIMARY KEY ("event_id", "read_by");
--> statement-breakpoint
INSERT INTO "admin_workspace_event_reads" ("event_id", "is_read", "read_at", "updated_at", "read_by")
SELECT legacy."event_id",
       legacy."is_read",
       CASE WHEN legacy."is_read" THEN COALESCE(legacy."read_at", legacy."updated_at", now()) ELSE NULL END,
       legacy."updated_at",
       admin."id"
FROM "admin_workspace_event_reads_legacy_unowned" AS legacy
CROSS JOIN "admin_users" AS admin
WHERE admin."role" = 'admin'
ON CONFLICT ("event_id", "read_by") DO NOTHING;
--> statement-breakpoint
DROP TABLE "admin_workspace_event_reads_legacy_unowned";
