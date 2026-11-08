CREATE TABLE IF NOT EXISTS public.site_analytics_interactions_daily (
  day date NOT NULL,
  page_path varchar(180) NOT NULL,
  region varchar(32) NOT NULL,
  hover_count integer NOT NULL DEFAULT 0,
  click_count integer NOT NULL DEFAULT 0,
  dwell_ms bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_analytics_interactions_daily_path_check CHECK (
    page_path LIKE '/%' AND page_path NOT LIKE '/site/node-logmin%'
  ),
  CONSTRAINT site_analytics_interactions_daily_region_check CHECK (
    region IN ('navigation', 'hero', 'audience', 'workflow', 'portfolio', 'pricing', 'faq', 'contact', 'support', 'footer', 'page-content')
  ),
  CONSTRAINT site_analytics_interactions_daily_counts_check CHECK (
    hover_count BETWEEN 0 AND 100000000
    AND click_count BETWEEN 0 AND 100000000
    AND dwell_ms BETWEEN 0 AND 9223372036854775807
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS site_analytics_interactions_daily_key_idx
  ON public.site_analytics_interactions_daily (day, page_path, region);

CREATE INDEX IF NOT EXISTS site_analytics_interactions_daily_day_idx
  ON public.site_analytics_interactions_daily (day);

ALTER TABLE public.site_analytics_interactions_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.site_analytics_interactions_daily FROM anon, authenticated;
