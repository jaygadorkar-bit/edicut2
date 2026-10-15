ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "session_version" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "session_version" uuid DEFAULT gen_random_uuid() NOT NULL;
