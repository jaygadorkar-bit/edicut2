ALTER TABLE "customer_subscriptions" ADD COLUMN "affiliate_id" uuid;--> statement-breakpoint
ALTER TABLE "customer_subscriptions" ADD COLUMN "affiliate_commission_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_subscriptions" ADD CONSTRAINT "customer_subscriptions_affiliate_id_marketing_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."marketing_affiliates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Existing subscriptions only stored a referral code, so preserve their attribution and snapshot the current partner rate.
UPDATE "customer_subscriptions" AS cs
SET "affiliate_id" = affiliate."id",
	"affiliate_commission_bps" = affiliate."commission_rate_bps"
FROM "marketing_affiliates" AS affiliate
WHERE cs."affiliate_id" IS NULL
	AND cs."affiliate_code" = affiliate."code";--> statement-breakpoint
CREATE INDEX "customer_subscriptions_affiliate_status_idx" ON "customer_subscriptions" USING btree ("affiliate_id","status");
