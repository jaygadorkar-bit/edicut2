ALTER TABLE "marketing_coupons" ADD COLUMN "affiliate_id" uuid;--> statement-breakpoint
ALTER TABLE "marketing_coupons" ADD CONSTRAINT "marketing_coupons_affiliate_id_marketing_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."marketing_affiliates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_coupons_affiliate_unique_idx" ON "marketing_coupons" USING btree ("affiliate_id") WHERE "marketing_coupons"."affiliate_id" IS NOT NULL;--> statement-breakpoint
-- Give already-approved partners a working coupon. Keep their existing
-- commission rate and use a stable ID-based code only when their referral
-- code is already reserved by a non-affiliate coupon.
INSERT INTO "marketing_coupons" ("code", "affiliate_id", "discount_type", "discount_value", "active")
SELECT
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM "marketing_coupons" c WHERE c."code" = upper(a."code"))
      THEN upper(a."code")
    ELSE upper(replace(a."id"::text, '-', ''))
  END,
  a."id",
  'percent',
  10,
  true
FROM "marketing_affiliates" a
WHERE NOT EXISTS (SELECT 1 FROM "marketing_coupons" c WHERE c."affiliate_id" = a."id")
  AND NOT EXISTS (
    SELECT 1 FROM "marketing_coupons" c
    WHERE c."code" = CASE
      WHEN NOT EXISTS (SELECT 1 FROM "marketing_coupons" existing WHERE existing."code" = upper(a."code"))
        THEN upper(a."code")
      ELSE upper(replace(a."id"::text, '-', ''))
    END
  )
  AND NOT EXISTS (
    SELECT 1 FROM "marketing_affiliates" other
    WHERE other."id" <> a."id"
      AND upper(other."code") = CASE
        WHEN NOT EXISTS (SELECT 1 FROM "marketing_coupons" existing WHERE existing."code" = upper(a."code"))
          THEN upper(a."code")
        ELSE upper(replace(a."id"::text, '-', ''))
      END
  )
ON CONFLICT DO NOTHING;
