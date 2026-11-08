CREATE TABLE IF NOT EXISTS "admin_workspace_event_reads" (
  "event_id" varchar(180) PRIMARY KEY,
  "is_read" boolean NOT NULL DEFAULT true,
  "read_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "read_by" uuid,
  CONSTRAINT "admin_workspace_event_reads_read_by_admin_users_id_fk"
    FOREIGN KEY ("read_by") REFERENCES "admin_users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
ALTER TABLE "admin_workspace_event_reads" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_workspace_event_reads_updated_at_idx"
  ON "admin_workspace_event_reads" USING btree ("updated_at");
