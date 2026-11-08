CREATE TABLE "affiliate_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel_url" varchar(512) NOT NULL,
	"audience" text NOT NULL,
	"promotion_plan" text NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"review_note" varchar(2000),
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_applications_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "affiliate_applications_status_check" CHECK ("affiliate_applications"."status" IN ('pending', 'approved', 'rejected')),
	CONSTRAINT "affiliate_applications_content_check" CHECK (length(btrim("affiliate_applications"."channel_url")) BETWEEN 8 AND 512 AND length(btrim("affiliate_applications"."audience")) BETWEEN 2 AND 4000 AND length(btrim("affiliate_applications"."promotion_plan")) BETWEEN 2 AND 4000)
);
--> statement-breakpoint
ALTER TABLE "affiliate_applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "affiliate_order_attributions" (
	"subscription_id" uuid PRIMARY KEY NOT NULL,
	"visit_id" uuid,
	"campaign" varchar(48),
	"affiliate_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "affiliate_order_attributions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "affiliate_payout_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payout_id" uuid NOT NULL,
	"source_type" varchar(16) NOT NULL,
	"source_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"reserved" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_payout_items_source_check" CHECK ("affiliate_payout_items"."source_type" IN ('project', 'subscription') AND "affiliate_payout_items"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "affiliate_payout_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "affiliate_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" varchar(16) NOT NULL,
	"destination" varchar(254) NOT NULL,
	"status" varchar(16) DEFAULT 'requested' NOT NULL,
	"reference" varchar(254),
	"note" varchar(2000),
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_payouts_amount_check" CHECK ("affiliate_payouts"."amount_cents" > 0),
	CONSTRAINT "affiliate_payouts_method_check" CHECK ("affiliate_payouts"."method" IN ('paypal', 'manual')),
	CONSTRAINT "affiliate_payouts_status_check" CHECK ("affiliate_payouts"."status" IN ('requested', 'approved', 'paid', 'rejected', 'cancelled')),
	CONSTRAINT "affiliate_payouts_terminal_fields_check" CHECK (("affiliate_payouts"."status" = 'paid' AND "affiliate_payouts"."paid_at" IS NOT NULL AND length(btrim(coalesce("affiliate_payouts"."reference", ''))) > 0) OR ("affiliate_payouts"."status" <> 'paid' AND "affiliate_payouts"."paid_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "affiliate_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"campaign" varchar(48),
	"landing_path" varchar(512) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_visits_landing_path_check" CHECK ("affiliate_visits"."landing_path" LIKE '/%' AND "affiliate_visits"."landing_path" NOT LIKE '//%')
);
--> statement-breakpoint
ALTER TABLE "affiliate_visits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "affiliate_applications" ADD CONSTRAINT "affiliate_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_applications" ADD CONSTRAINT "affiliate_applications_reviewed_by_admin_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_order_attributions" ADD CONSTRAINT "affiliate_order_attributions_subscription_id_customer_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."customer_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_order_attributions" ADD CONSTRAINT "affiliate_order_attributions_visit_id_affiliate_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."affiliate_visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_order_attributions" ADD CONSTRAINT "affiliate_order_attributions_affiliate_id_marketing_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."marketing_affiliates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_payout_items" ADD CONSTRAINT "affiliate_payout_items_payout_id_affiliate_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."affiliate_payouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_affiliate_id_marketing_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."marketing_affiliates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_reviewed_by_admin_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_visits" ADD CONSTRAINT "affiliate_visits_affiliate_id_marketing_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."marketing_affiliates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliate_applications_status_created_idx" ON "affiliate_applications" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "affiliate_order_attributions_affiliate_idx" ON "affiliate_order_attributions" USING btree ("affiliate_id","created_at");--> statement-breakpoint
CREATE INDEX "affiliate_payout_items_payout_idx" ON "affiliate_payout_items" USING btree ("payout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_payout_items_source_reserved_idx" ON "affiliate_payout_items" USING btree ("source_type","source_id") WHERE "affiliate_payout_items"."reserved" = true;--> statement-breakpoint
CREATE INDEX "affiliate_payouts_affiliate_created_idx" ON "affiliate_payouts" USING btree ("affiliate_id","created_at");--> statement-breakpoint
CREATE INDEX "affiliate_payouts_status_created_idx" ON "affiliate_payouts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "affiliate_visits_affiliate_created_idx" ON "affiliate_visits" USING btree ("affiliate_id","created_at");REVOKE ALL ON affiliate_applications, affiliate_visits, affiliate_order_attributions, affiliate_payouts, affiliate_payout_items FROM anon, authenticated;
