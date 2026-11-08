ALTER TABLE "public"."marketing_coupons" ADD COLUMN "affiliate_id" uuid;
ALTER TABLE "public"."marketing_coupons"
  ADD CONSTRAINT "marketing_coupons_affiliate_id_marketing_affiliates_id_fk"
  FOREIGN KEY ("affiliate_id") REFERENCES "public"."marketing_affiliates"("id")
  ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "marketing_coupons_affiliate_unique_idx"
  ON "public"."marketing_coupons" USING btree ("affiliate_id")
  WHERE "affiliate_id" IS NOT NULL;

-- Existing approved affiliates keep their commission settings and get a
-- default 10% coupon. Reuse the referral code unless a generic coupon already
-- owns it, then use an ID-derived code.
INSERT INTO "public"."marketing_coupons" ("code", "affiliate_id", "discount_type", "discount_value", "active")
SELECT
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM "public"."marketing_coupons" c WHERE c."code" = upper(a."code"))
      THEN upper(a."code")
    ELSE upper(replace(a."id"::text, '-', ''))
  END,
  a."id",
  'percent',
  10,
  true
FROM "public"."marketing_affiliates" a
WHERE NOT EXISTS (SELECT 1 FROM "public"."marketing_coupons" c WHERE c."affiliate_id" = a."id")
  AND NOT EXISTS (
    SELECT 1 FROM "public"."marketing_coupons" c
    WHERE c."code" = CASE
      WHEN NOT EXISTS (SELECT 1 FROM "public"."marketing_coupons" existing WHERE existing."code" = upper(a."code"))
        THEN upper(a."code")
      ELSE upper(replace(a."id"::text, '-', ''))
    END
  )
  AND NOT EXISTS (
    SELECT 1 FROM "public"."marketing_affiliates" other
    WHERE other."id" <> a."id"
      AND upper(other."code") = CASE
        WHEN NOT EXISTS (SELECT 1 FROM "public"."marketing_coupons" existing WHERE existing."code" = upper(a."code"))
          THEN upper(a."code")
        ELSE upper(replace(a."id"::text, '-', ''))
      END
  )
ON CONFLICT DO NOTHING;
