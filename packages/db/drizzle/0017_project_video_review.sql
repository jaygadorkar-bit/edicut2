CREATE TABLE "project_review_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"parent_id" uuid,
	"actor_key" varchar(64) NOT NULL,
	"author_name" varchar(120) NOT NULL,
	"author_role" varchar(24) NOT NULL,
	"body" text NOT NULL,
	"timestamp_ms" integer,
	"end_ms" integer,
	"annotation" jsonb,
	"category" varchar(16) DEFAULT 'change' NOT NULL,
	"priority" varchar(16) DEFAULT 'normal' NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_review_comments_body_check" CHECK (length("project_review_comments"."body") BETWEEN 1 AND 4000),
	CONSTRAINT "project_review_comments_time_check" CHECK (("project_review_comments"."timestamp_ms" IS NULL AND "project_review_comments"."end_ms" IS NULL AND "project_review_comments"."annotation" IS NULL) OR ("project_review_comments"."timestamp_ms" IS NOT NULL AND "project_review_comments"."timestamp_ms" BETWEEN 0 AND 21600000 AND ("project_review_comments"."end_ms" IS NULL OR "project_review_comments"."end_ms" BETWEEN "project_review_comments"."timestamp_ms" AND 21600000))),
	CONSTRAINT "project_review_comments_category_check" CHECK ("project_review_comments"."category" IN ('change', 'question', 'praise') AND "project_review_comments"."priority" IN ('normal', 'high'))
);
--> statement-breakpoint
ALTER TABLE "project_review_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_review_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_review_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_review_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"actor_key" varchar(64) NOT NULL,
	"author_name" varchar(120) NOT NULL,
	"title" varchar(160) NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"public_id" varchar(240) NOT NULL,
	"mime" varchar(40) NOT NULL,
	"bytes" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"decision" varchar(24) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_review_versions_media_check" CHECK ("project_review_versions"."mime" IN ('video/mp4', 'video/webm') AND "project_review_versions"."bytes" BETWEEN 1 AND 52428800 AND "project_review_versions"."duration_ms" BETWEEN 1 AND 21600000),
	CONSTRAINT "project_review_versions_decision_check" CHECK ("project_review_versions"."decision" IN ('pending', 'approved', 'changes_requested'))
);
--> statement-breakpoint
ALTER TABLE "project_review_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_review_comments" ADD CONSTRAINT "project_review_comments_version_id_project_review_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."project_review_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_review_members" ADD CONSTRAINT "project_review_members_project_id_workspace_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."workspace_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_review_members" ADD CONSTRAINT "project_review_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_review_versions" ADD CONSTRAINT "project_review_versions_project_id_workspace_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."workspace_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_review_comments_version_created_idx" ON "project_review_comments" USING btree ("version_id","created_at","id");--> statement-breakpoint
CREATE INDEX "project_review_comments_parent_idx" ON "project_review_comments" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_review_members_project_user_idx" ON "project_review_members" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_review_members_user_idx" ON "project_review_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_review_versions_project_created_idx" ON "project_review_versions" USING btree ("project_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_review_versions_public_id_idx" ON "project_review_versions" USING btree ("public_id");
--> statement-breakpoint
ALTER TABLE "workspace_projects" ADD COLUMN "review_revision" integer DEFAULT 0 NOT NULL;
