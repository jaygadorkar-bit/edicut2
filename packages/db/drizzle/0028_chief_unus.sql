CREATE TABLE "application_error_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"error_name" varchar(120) NOT NULL,
	"message" varchar(2000) NOT NULL,
	"stack" varchar(8000),
	"route" varchar(256) NOT NULL,
	"method" varchar(12) NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_error_logs_fingerprint_unique" UNIQUE("fingerprint"),
	CONSTRAINT "application_error_logs_occurrences_check" CHECK ("application_error_logs"."occurrences" > 0)
);
--> statement-breakpoint
ALTER TABLE "application_error_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "application_error_logs_last_seen_idx" ON "application_error_logs" USING btree ("last_seen_at");