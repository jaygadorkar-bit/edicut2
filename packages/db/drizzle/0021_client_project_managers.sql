CREATE TABLE "client_project_managers" (
	"client_id" uuid PRIMARY KEY NOT NULL,
	"manager_id" uuid,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_project_managers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_project_managers" ADD CONSTRAINT "client_project_managers_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_project_managers" ADD CONSTRAINT "client_project_managers_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_project_managers" ADD CONSTRAINT "client_project_managers_assigned_by_admin_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_project_managers_manager_idx" ON "client_project_managers" USING btree ("manager_id","assigned_at");--> statement-breakpoint
REVOKE ALL ON "client_project_managers" FROM PUBLIC;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "client_project_managers" FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "client_project_managers" FROM authenticated;
  END IF;
END $$;
