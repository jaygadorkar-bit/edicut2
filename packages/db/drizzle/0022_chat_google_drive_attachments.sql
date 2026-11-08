CREATE TABLE "chat_attachment_uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"actor_key" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"mime" varchar(64) NOT NULL,
	"bytes" bigint NOT NULL,
	"session_uri" text,
	"drive_file_id" varchar(240),
	"received_bytes" bigint DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'starting' NOT NULL,
	"message_id" uuid,
	"lease_until" timestamp with time zone,
	"expires_at" timestamp with time zone DEFAULT now() + interval '1 day' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_attachment_uploads_media_check" CHECK ("chat_attachment_uploads"."mime" IN ('image/jpeg','image/png','image/webp','image/gif','application/pdf','video/mp4','video/webm') AND "chat_attachment_uploads"."bytes" BETWEEN 1 AND 10737418240 AND "chat_attachment_uploads"."received_bytes" BETWEEN 0 AND "chat_attachment_uploads"."bytes"),
	CONSTRAINT "chat_attachment_uploads_status_check" CHECK ("chat_attachment_uploads"."status" IN ('starting','uploading','uploaded','saved','failed','deleted'))
);
--> statement-breakpoint
ALTER TABLE "chat_attachment_uploads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chat_attachment_uploads" ADD CONSTRAINT "chat_attachment_uploads_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_attachment_uploads_client_expiry_idx" ON "chat_attachment_uploads" USING btree ("client_id","expires_at");--> statement-breakpoint
CREATE INDEX "chat_attachment_uploads_room_idx" ON "chat_attachment_uploads" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_attachment_uploads_drive_file_idx" ON "chat_attachment_uploads" USING btree ("drive_file_id") WHERE "chat_attachment_uploads"."drive_file_id" IS NOT NULL;
--> statement-breakpoint
REVOKE ALL ON chat_attachment_uploads FROM PUBLIC;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON chat_attachment_uploads FROM anon; END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON chat_attachment_uploads FROM authenticated; END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN REVOKE ALL ON chat_attachment_uploads FROM service_role; END IF;
END $$;
