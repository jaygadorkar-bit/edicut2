-- Daily consented totals only. No visitor IDs, customer details, referrer URLs, or query strings.
CREATE TABLE IF NOT EXISTS public.site_analytics_acquisition_daily (
  day date NOT NULL,
  page_path varchar(180) NOT NULL,
  landing_path varchar(180) NOT NULL,
  source varchar(32) NOT NULL,
  event varchar(32) NOT NULL,
  event_count bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_analytics_acquisition_daily_page_check CHECK (
    page_path LIKE '/%' AND page_path !~ '[?#@\\]' AND page_path NOT LIKE '//%'
    AND landing_path LIKE '/%' AND landing_path !~ '[?#@\\]' AND landing_path NOT LIKE '//%'
  ),
  CONSTRAINT site_analytics_acquisition_daily_source_check CHECK (
    source IN ('organic_search', 'paid_search', 'social', 'email', 'referral', 'direct', 'other_campaign')
  ),
  CONSTRAINT site_analytics_acquisition_daily_event_check CHECK (
    event IN ('page_view', 'contact_inquiry', 'quote_request', 'checkout_start')
  ),
  CONSTRAINT site_analytics_acquisition_daily_count_check CHECK (event_count >= 0),
  PRIMARY KEY (day, page_path, landing_path, source, event)
);

ALTER TABLE public.site_analytics_acquisition_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.site_analytics_acquisition_daily FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.site_analytics_acquisition_daily IS
  'Consent-based daily acquisition and conversion signals, written only through the validated server endpoint.';
