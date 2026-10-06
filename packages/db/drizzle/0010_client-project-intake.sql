CREATE TABLE "creator_profiles" (
	"owner_id" uuid PRIMARY KEY NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_intakes" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"request_token" uuid NOT NULL,
	"reserved_units" integer NOT NULL,
	"brief" jsonb NOT NULL,
	"channel_snapshot" jsonb NOT NULL,
	CONSTRAINT "project_intakes_reserved_check" CHECK ("project_intakes"."reserved_units" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_entitlements" (
	"subscription_id" uuid PRIMARY KEY NOT NULL,
	"granted_units" integer NOT NULL,
	"used_units" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "purchase_entitlements_balance_check" CHECK ("purchase_entitlements"."granted_units" > 0 AND "purchase_entitlements"."used_units" >= 0 AND "purchase_entitlements"."used_units" <= "purchase_entitlements"."granted_units")
);
--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_intakes" ADD CONSTRAINT "project_intakes_project_id_workspace_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."workspace_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_intakes" ADD CONSTRAINT "project_intakes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_intakes" ADD CONSTRAINT "project_intakes_subscription_id_customer_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."customer_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_entitlements" ADD CONSTRAINT "purchase_entitlements_subscription_id_customer_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."customer_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_intakes_owner_token_idx" ON "project_intakes" USING btree ("owner_id","request_token");--> statement-breakpoint
CREATE INDEX "project_intakes_subscription_idx" ON "project_intakes" USING btree ("subscription_id");