CREATE TABLE IF NOT EXISTS "user_workspace_event_reads" (
	"event_id" varchar(180) NOT NULL,
	"is_read" boolean DEFAULT true NOT NULL,
	"read_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "user_workspace_event_reads_pkey" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "user_workspace_event_reads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_workspace_event_reads_user_id_users_id_fk'
      AND conrelid = 'public.user_workspace_event_reads'::regclass
  ) THEN
    ALTER TABLE public.user_workspace_event_reads
      ADD CONSTRAINT user_workspace_event_reads_user_id_users_id_fk
      FOREIGN KEY (user_id) REFERENCES public.users(id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END;
$$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_workspace_event_reads_updated_at_idx" ON "user_workspace_event_reads" USING btree ("updated_at");
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "user_workspace_event_reads"
  FROM PUBLIC, anon, authenticated, service_role;