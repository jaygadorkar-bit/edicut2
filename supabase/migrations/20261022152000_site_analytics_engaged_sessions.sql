-- Aggregate consented browser-tab sessions after trusted user interaction.
-- No visitor/session identifiers or personal data are retained.
CREATE TABLE IF NOT EXISTS public.site_analytics_engaged_sessions_daily (
  day date PRIMARY KEY,
  session_count bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_analytics_engaged_sessions_daily_count_check CHECK (session_count >= 0)
);

ALTER TABLE public.site_analytics_engaged_sessions_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.site_analytics_engaged_sessions_daily FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.site_analytics_engaged_sessions_daily IS
  'Daily totals of consented browser-tab sessions after trusted user input; no visitor identifiers are stored.';
