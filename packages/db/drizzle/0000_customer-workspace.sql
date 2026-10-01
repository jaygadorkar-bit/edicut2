-- Customer work is separate from `projects`, which stores public portfolio entries.
-- This change assumes the existing application `users` table is already present.
CREATE TABLE IF NOT EXISTS "workspace_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" varchar(120) NOT NULL,
	"channel_name" varchar(120) NOT NULL,
	"package_slug" varchar(120) NOT NULL,
	"category" varchar(80),
	"cadence" varchar(120),
	"deadline" varchar(10),
	"notes" text,
	"status" varchar(32) DEFAULT 'intake' NOT NULL,
	"billing_name" varchar(120),
	"billing_email" varchar(254),
	"estimated_amount_cents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"billing_status" varchar(32) DEFAULT 'quote_requested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_project_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"file_name" varchar(160) NOT NULL,
	"share_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_project_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"decision" varchar(32) NOT NULL,
	"feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_projects" ADD CONSTRAINT "workspace_projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_project_files" ADD CONSTRAINT "workspace_project_files_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_project_files" ADD CONSTRAINT "workspace_project_files_project_id_workspace_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."workspace_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_project_reviews" ADD CONSTRAINT "workspace_project_reviews_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_project_reviews" ADD CONSTRAINT "workspace_project_reviews_project_id_workspace_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."workspace_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_projects_owner_updated_idx" ON "workspace_projects" USING btree ("owner_id", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_projects_owner_status_idx" ON "workspace_projects" USING btree ("owner_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_project_files_owner_project_idx" ON "workspace_project_files" USING btree ("owner_id", "project_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_project_reviews_owner_project_idx" ON "workspace_project_reviews" USING btree ("owner_id", "project_id", "created_at");
