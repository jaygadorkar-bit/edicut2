CREATE TABLE "project_review_uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"actor_key" varchar(64) NOT NULL,
	"title" varchar(100) NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"mime" varchar(40) NOT NULL,
	"bytes" bigint NOT NULL,
	"duration_ms" integer NOT NULL,
	"channel_id" varchar(32),
	"session_uri" text,
	"video_id" varchar(11),
	"received_bytes" bigint DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'starting' NOT NULL,
	"lease_until" timestamp with time zone,
	"expires_at" timestamp with time zone DEFAULT now()+interval '1 day' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_review_uploads_media_check" CHECK ("project_review_uploads"."mime" IN ('video/mp4','video/webm') AND "project_review_uploads"."bytes" BETWEEN 16 AND 10737418240 AND "project_review_uploads"."duration_ms" BETWEEN 1 AND 21600000 AND "project_review_uploads"."received_bytes" BETWEEN 0 AND "project_review_uploads"."bytes"),
	CONSTRAINT "project_review_uploads_status_check" CHECK ("project_review_uploads"."status" IN ('starting','uploading','uploaded','saved','failed'))
);
--> statement-breakpoint
ALTER TABLE "project_review_uploads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "video_storage_connections" (
	"provider" varchar(20) PRIMARY KEY NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"channel_name" varchar(160) NOT NULL,
	"refresh_token" text NOT NULL,
	"connected_by" uuid,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_storage_connections_provider_check" CHECK ("video_storage_connections"."provider"='youtube')
);
--> statement-breakpoint
ALTER TABLE "video_storage_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_review_versions" DROP CONSTRAINT "project_review_versions_media_check";--> statement-breakpoint
ALTER TABLE "project_review_versions" ALTER COLUMN "bytes" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "project_review_versions" ADD COLUMN "provider" varchar(20) DEFAULT 'cloudinary' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_review_versions" ADD COLUMN "youtube_id" varchar(11);--> statement-breakpoint
ALTER TABLE "project_review_uploads" ADD CONSTRAINT "project_review_uploads_project_id_workspace_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."workspace_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_storage_connections" ADD CONSTRAINT "video_storage_connections_connected_by_admin_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_review_uploads_actor_expiry_idx" ON "project_review_uploads" USING btree ("actor_key","expires_at");--> statement-breakpoint
CREATE INDEX "project_review_uploads_project_idx" ON "project_review_uploads" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "project_review_versions" ADD CONSTRAINT "project_review_versions_provider_check" CHECK (("project_review_versions"."provider"='cloudinary' AND "project_review_versions"."youtube_id" IS NULL AND "project_review_versions"."bytes"<=52428800) OR ("project_review_versions"."provider"='youtube' AND "project_review_versions"."youtube_id" IS NOT NULL AND "project_review_versions"."youtube_id" ~ '^[A-Za-z0-9_-]{11}$'));--> statement-breakpoint
ALTER TABLE "project_review_versions" ADD CONSTRAINT "project_review_versions_media_check" CHECK ("project_review_versions"."mime" IN ('video/mp4', 'video/webm') AND "project_review_versions"."bytes" BETWEEN 1 AND 10737418240 AND "project_review_versions"."duration_ms" BETWEEN 1 AND 21600000);