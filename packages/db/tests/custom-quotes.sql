-- Run in one transaction. Test rows exist only in a temporary table and are
-- removed on commit; no real customer or quote data is changed.
CREATE TEMP TABLE quote_probe (LIKE public.custom_quotes INCLUDING ALL) ON COMMIT DROP;
--> statement-breakpoint
DO $$
DECLARE saved_id uuid; probe_owner uuid := gen_random_uuid(); probe_token uuid := gen_random_uuid();
BEGIN
  INSERT INTO quote_probe (owner_id, request_token, title, customer_name, customer_email, options)
    VALUES (probe_owner, probe_token, 'Constraint probe', 'Test', 'test@example.invalid', '{}') RETURNING id INTO saved_id;
  IF (SELECT status FROM quote_probe WHERE id = saved_id) <> 'new' THEN RAISE EXCEPTION 'Incorrect initial status'; END IF;
  BEGIN
    INSERT INTO quote_probe (owner_id, request_token, title, customer_name, customer_email, options)
      VALUES (probe_owner, probe_token, 'Duplicate', 'Test', 'test@example.invalid', '{}');
    RAISE EXCEPTION 'Duplicate request token accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    UPDATE quote_probe SET preferred_contact = 'whatsapp', phone = NULL WHERE id = saved_id;
    RAISE EXCEPTION 'WhatsApp without a phone accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE quote_probe SET status = 'paid' WHERE id = saved_id;
    RAISE EXCEPTION 'Invalid quote status accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE quote_probe SET options = '[]' WHERE id = saved_id;
    RAISE EXCEPTION 'Non-object options accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE quote_probe SET status = 'reviewing', internal_notes = 'Admin-only note', updated_at = '2026-10-04T10:00:00.123456Z' WHERE id = saved_id;
  UPDATE quote_probe SET status = 'contacted' WHERE id = saved_id AND date_trunc('milliseconds', updated_at) = '2026-10-04T10:00:00.123Z'::timestamptz;
  IF NOT FOUND THEN RAISE EXCEPTION 'Millisecond revision guard failed'; END IF;
  UPDATE quote_probe SET status = 'closed' WHERE id = saved_id AND date_trunc('milliseconds', updated_at) = '2026-10-04T10:00:00.122Z'::timestamptz;
  IF FOUND THEN RAISE EXCEPTION 'Stale revision accepted'; END IF;
END $$;
