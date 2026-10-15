-- The live application schema is also maintained by Drizzle. Keep these
-- Realtime trigger targets represented in Supabase's migration history so a
-- clean local Supabase stack can install the broadcast migration. Existing
-- hosted tables are left untouched by CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS public.workspace_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title varchar(120) NOT NULL,
  channel_name varchar(120) NOT NULL,
  package_slug varchar(120) NOT NULL,
  category varchar(80),
  cadence varchar(120),
  deadline varchar(10),
  notes text,
  status varchar(32) NOT NULL DEFAULT 'intake',
  billing_name varchar(120),
  billing_email varchar(254),
  billing_company varchar(120),
  billing_country varchar(120),
  final_amount_cents integer,
  invoice_url text,
  estimated_amount_cents integer NOT NULL DEFAULT 0,
  coupon_id uuid,
  coupon_code varchar(32),
  discount_amount_cents integer NOT NULL DEFAULT 0,
  affiliate_id uuid,
  affiliate_code varchar(32),
  affiliate_commission_bps integer NOT NULL DEFAULT 0,
  currency varchar(3) NOT NULL DEFAULT 'USD',
  billing_status varchar(32) NOT NULL DEFAULT 'quote_requested',
  review_revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_project_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.workspace_projects(id) ON DELETE CASCADE,
  decision varchar(32) NOT NULL,
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  purchase_type varchar(16) NOT NULL DEFAULT 'monthly',
  package_slug varchar(120) NOT NULL,
  plan_name varchar(120) NOT NULL,
  add_ons jsonb NOT NULL DEFAULT '[]'::jsonb,
  country varchar(2) NOT NULL,
  phone varchar(16) NOT NULL,
  subtotal_cents integer NOT NULL,
  discount_cents integer NOT NULL DEFAULT 0,
  amount_cents integer NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'USD',
  coupon_code varchar(32),
  affiliate_id uuid,
  affiliate_code varchar(32),
  affiliate_commission_bps integer NOT NULL DEFAULT 0,
  status varchar(16) NOT NULL DEFAULT 'unpaid',
  paid_at timestamptz,
  paid_by uuid REFERENCES public.admin_users(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.custom_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_token uuid NOT NULL,
  title varchar(120) NOT NULL,
  customer_name varchar(120) NOT NULL,
  customer_email varchar(254) NOT NULL,
  phone varchar(32),
  preferred_contact varchar(16) NOT NULL DEFAULT 'email',
  options jsonb NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'new',
  internal_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.custom_quotes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.project_review_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.workspace_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_review_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.project_review_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.workspace_projects(id) ON DELETE CASCADE,
  actor_key varchar(64) NOT NULL,
  author_name varchar(120) NOT NULL,
  title varchar(160) NOT NULL,
  note text NOT NULL DEFAULT '',
  public_id varchar(240) NOT NULL,
  mime varchar(40) NOT NULL,
  bytes bigint NOT NULL,
  provider varchar(20) NOT NULL DEFAULT 'cloudinary',
  youtube_id varchar(11),
  drive_file_id varchar(240),
  duration_ms integer NOT NULL,
  decision varchar(24) NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_review_versions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.project_review_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.project_review_versions(id) ON DELETE CASCADE,
  parent_id uuid,
  actor_key varchar(64) NOT NULL,
  author_name varchar(120) NOT NULL,
  author_role varchar(24) NOT NULL,
  body text NOT NULL,
  timestamp_ms integer,
  end_ms integer,
  annotation jsonb,
  category varchar(16) NOT NULL DEFAULT 'change',
  priority varchar(16) NOT NULL DEFAULT 'normal',
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_review_comments ENABLE ROW LEVEL SECURITY;
