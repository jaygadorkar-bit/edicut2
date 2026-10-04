-- Run only against a disposable database after the Drizzle migrations.
BEGIN;
INSERT INTO users (id, email) VALUES ('10000000-0000-4000-8000-000000000001', 'addons-test@example.test');
INSERT INTO customer_subscriptions (id, owner_id, package_slug, plan_name, purchase_type, country, phone, subtotal_cents, amount_cents)
VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'single-creator', 'Creator Video', 'single', 'US', '+12025550123', 10900, 10900);
DO $$ BEGIN
  IF (SELECT add_ons FROM customer_subscriptions WHERE id = '20000000-0000-4000-8000-000000000001') <> '[]'::jsonb THEN
    RAISE EXCEPTION 'Selections without add-ons must default to an empty array';
  END IF;
END $$;
UPDATE customer_subscriptions SET add_ons = '[{"id":"thumbnail","label":"Custom thumbnail","amountCents":2000},{"id":"short-form","label":"Short-form video","amountCents":2000}]', subtotal_cents = 14900, discount_cents = 1490, amount_cents = 13410
WHERE id = '20000000-0000-4000-8000-000000000001';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM customer_subscriptions WHERE id = '20000000-0000-4000-8000-000000000001'
    AND jsonb_array_length(add_ons) = 2 AND add_ons->0->>'id' = 'thumbnail'
    AND amount_cents = 13410 AND amount_cents = subtotal_cents - discount_cents) THEN
    RAISE EXCEPTION 'Saved selections must retain add-on snapshots and discounted totals';
  END IF;
  BEGIN
    UPDATE customer_subscriptions SET add_ons = '[{},{},{}]' WHERE id = '20000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'More than two add-ons should have been rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE customer_subscriptions SET add_ons = '{}' WHERE id = '20000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Non-array snapshots should have been rejected';
  EXCEPTION WHEN check_violation OR invalid_parameter_value THEN NULL;
  END;
END $$;
ROLLBACK;
