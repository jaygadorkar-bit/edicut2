-- Store scrubbed, deduplicated server exceptions for admin troubleshooting.
-- Application writes are rate limited and the table is pruned to 500 rows / 30 days.
CREATE TABLE IF NOT EXISTS public.application_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint varchar(64) NOT NULL UNIQUE,
  error_name varchar(120) NOT NULL,
  message varchar(2000) NOT NULL,
  stack varchar(8000),
  route varchar(256) NOT NULL,
  method varchar(12) NOT NULL,
  occurrences integer NOT NULL DEFAULT 1 CHECK (occurrences > 0),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.application_error_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.application_error_logs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.application_error_logs TO service_role;
CREATE INDEX IF NOT EXISTS application_error_logs_last_seen_idx
  ON public.application_error_logs (last_seen_at);
