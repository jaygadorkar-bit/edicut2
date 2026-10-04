CREATE TABLE "marketing_affiliates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"commission_rate_bps" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_affiliates_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "marketing_affiliates_code_unique" UNIQUE("code"),
	CONSTRAINT "marketing_affiliates_commission_rate_check" CHECK ("marketing_affiliates"."commission_rate_bps" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "marketing_coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"discount_type" varchar(16) NOT NULL,
	"discount_value" integer NOT NULL,
	"minimum_subtotal_cents" integer,
	"max_redemptions" integer,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_coupons_code_unique" UNIQUE("code"),
	CONSTRAINT "marketing_coupons_discount_type_check" CHECK ("marketing_coupons"."discount_type" IN ('percent', 'fixed')),
	CONSTRAINT "marketing_coupons_discount_value_check" CHECK (("marketing_coupons"."discount_type" = 'percent' AND "marketing_coupons"."discount_value" BETWEEN 1 AND 100) OR ("marketing_coupons"."discount_type" = 'fixed' AND "marketing_coupons"."discount_value" > 0)),
	CONSTRAINT "marketing_coupons_redemption_count_check" CHECK ("marketing_coupons"."redemption_count" >= 0),
	CONSTRAINT "marketing_coupons_max_redemptions_check" CHECK ("marketing_coupons"."max_redemptions" IS NULL OR "marketing_coupons"."max_redemptions" > 0),
	CONSTRAINT "marketing_coupons_minimum_subtotal_check" CHECK ("marketing_coupons"."minimum_subtotal_cents" IS NULL OR "marketing_coupons"."minimum_subtotal_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "workspace_projects" ADD COLUMN "coupon_id" uuid;--> statement-breakpoint
ALTER TABLE "workspace_projects" ADD COLUMN "coupon_code" varchar(32);--> statement-breakpoint
ALTER TABLE "workspace_projects" ADD COLUMN "discount_amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_projects" ADD COLUMN "affiliate_id" uuid;--> statement-breakpoint
ALTER TABLE "workspace_projects" ADD COLUMN "affiliate_code" varchar(32);--> statement-breakpoint
ALTER TABLE "workspace_projects" ADD COLUMN "affiliate_commission_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "marketing_affiliates" ADD CONSTRAINT "marketing_affiliates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_affiliates_active_code_idx" ON "marketing_affiliates" USING btree ("active","code");--> statement-breakpoint
CREATE INDEX "marketing_coupons_active_expiry_idx" ON "marketing_coupons" USING btree ("active","expires_at");--> statement-breakpoint
ALTER TABLE "workspace_projects" ADD CONSTRAINT "workspace_projects_coupon_id_marketing_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."marketing_coupons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_projects" ADD CONSTRAINT "workspace_projects_affiliate_id_marketing_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."marketing_affiliates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_projects_owner_coupon_unique_idx" ON "workspace_projects" USING btree ("owner_id","coupon_id") WHERE "workspace_projects"."coupon_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "workspace_projects_affiliate_status_idx" ON "workspace_projects" USING btree ("affiliate_id","billing_status");