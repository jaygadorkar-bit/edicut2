CREATE TABLE "custom_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"request_token" uuid NOT NULL,
	"title" varchar(120) NOT NULL,
	"customer_name" varchar(120) NOT NULL,
	"customer_email" varchar(254) NOT NULL,
	"phone" varchar(32),
	"preferred_contact" varchar(16) DEFAULT 'email' NOT NULL,
	"options" jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'new' NOT NULL,
	"internal_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_quotes_status_check" CHECK ("custom_quotes"."status" IN ('new', 'reviewing', 'contacted', 'closed')),
	CONSTRAINT "custom_quotes_contact_check" CHECK ("custom_quotes"."preferred_contact" IN ('email', 'whatsapp') AND ("custom_quotes"."preferred_contact" <> 'whatsapp' OR coalesce(length("custom_quotes"."phone"), 0) > 0)),
	CONSTRAINT "custom_quotes_options_check" CHECK (jsonb_typeof("custom_quotes"."options") = 'object')
);
--> statement-breakpoint
ALTER TABLE "custom_quotes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "custom_quotes" ADD CONSTRAINT "custom_quotes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_quotes_owner_token_idx" ON "custom_quotes" USING btree ("owner_id","request_token");--> statement-breakpoint
CREATE INDEX "custom_quotes_owner_created_idx" ON "custom_quotes" USING btree ("owner_id","created_at","id");--> statement-breakpoint
CREATE INDEX "custom_quotes_status_created_idx" ON "custom_quotes" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "custom_quotes_created_idx" ON "custom_quotes" USING btree ("created_at","id");
--> statement-breakpoint
REVOKE ALL ON TABLE "custom_quotes" FROM PUBLIC;
--> statement-breakpoint
-- Requests contain private customer briefs. Only the authenticated server uses
-- this table; installations with browser-facing roles must not grant access.
DO $$
DECLARE browser_role text;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = browser_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.custom_quotes FROM %I', browser_role);
    END IF;
  END LOOP;
END $$;
