CREATE TABLE "customer_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"package_slug" varchar(120) NOT NULL,
	"plan_name" varchar(120) NOT NULL,
	"country" varchar(2) NOT NULL,
	"phone" varchar(16) NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"coupon_code" varchar(32),
	"affiliate_code" varchar(32),
	"status" varchar(16) DEFAULT 'unpaid' NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_subscriptions_amount_check" CHECK ("customer_subscriptions"."subtotal_cents" > 0 AND "customer_subscriptions"."discount_cents" >= 0 AND "customer_subscriptions"."amount_cents" >= 0 AND "customer_subscriptions"."amount_cents" = "customer_subscriptions"."subtotal_cents" - "customer_subscriptions"."discount_cents"),
	CONSTRAINT "customer_subscriptions_status_check" CHECK (("customer_subscriptions"."status" = 'unpaid' AND "customer_subscriptions"."paid_at" IS NULL AND "customer_subscriptions"."paid_by" IS NULL) OR ("customer_subscriptions"."status" = 'paid' AND "customer_subscriptions"."paid_at" IS NOT NULL AND "customer_subscriptions"."paid_by" IS NOT NULL AND "customer_subscriptions"."deleted_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "customer_subscriptions" ADD CONSTRAINT "customer_subscriptions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_subscriptions" ADD CONSTRAINT "customer_subscriptions_paid_by_admin_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_subscriptions_owner_created_idx" ON "customer_subscriptions" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "customer_subscriptions_created_idx" ON "customer_subscriptions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_subscriptions_unpaid_plan_idx" ON "customer_subscriptions" USING btree ("owner_id","package_slug") WHERE "customer_subscriptions"."status" = 'unpaid' AND "customer_subscriptions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_subscriptions_paid_coupon_idx" ON "customer_subscriptions" USING btree ("owner_id","coupon_code") WHERE "customer_subscriptions"."status" = 'paid' AND "customer_subscriptions"."coupon_code" IS NOT NULL;