-- Keep Supabase's migration history aligned with the server-side review
-- storage schema. These tables are accessed through the app's Postgres
-- connection, never directly through the browser Data API.

CREATE TABLE IF NOT EXISTS public.video_storage_connections (
  provider varchar(20) PRIMARY KEY,
  channel_id varchar(32) NOT NULL,
  channel_name varchar(160) NOT NULL,
  refresh_token text NOT NULL,
  connected_by uuid,
  connected_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_storage_connections_provider_check
    CHECK (provider IN ('youtube', 'google_drive')),
  CONSTRAINT video_storage_connections_connected_by_admin_users_id_fk
    FOREIGN KEY (connected_by) REFERENCES public.admin_users(id) ON DELETE SET NULL
);

ALTER TABLE public.video_storage_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_storage_connections
  DROP CONSTRAINT IF EXISTS video_storage_connections_provider_check;
ALTER TABLE public.video_storage_connections
  ADD CONSTRAINT video_storage_connections_provider_check
  CHECK (provider IN ('youtube', 'google_drive'));

CREATE TABLE IF NOT EXISTS public.project_review_uploads (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  actor_key varchar(64) NOT NULL,
  title varchar(100) NOT NULL,
  note text NOT NULL DEFAULT '',
  mime varchar(40) NOT NULL,
  bytes bigint NOT NULL,
  duration_ms integer NOT NULL,
  channel_id varchar(32),
  session_uri text,
  video_id varchar(11),
  received_bytes bigint NOT NULL DEFAULT 0,
  status varchar(16) NOT NULL DEFAULT 'starting',
  lease_until timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '1 day',
  created_at timestamptz NOT NULL DEFAULT now(),
  provider varchar(20) NOT NULL DEFAULT 'youtube',
  drive_file_id varchar(240),
  CONSTRAINT project_review_uploads_project_id_workspace_projects_id_fk
    FOREIGN KEY (project_id) REFERENCES public.workspace_projects(id) ON DELETE CASCADE
);

ALTER TABLE public.project_review_uploads
  ADD COLUMN IF NOT EXISTS provider varchar(20) NOT NULL DEFAULT 'youtube';
ALTER TABLE public.project_review_uploads
  ADD COLUMN IF NOT EXISTS drive_file_id varchar(240);
ALTER TABLE public.project_review_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_review_uploads
  DROP CONSTRAINT IF EXISTS project_review_uploads_media_check;
ALTER TABLE public.project_review_uploads
  ADD CONSTRAINT project_review_uploads_media_check
  CHECK (
    mime IN ('video/mp4', 'video/webm')
    AND bytes BETWEEN 16 AND 10737418240
    AND duration_ms BETWEEN 1 AND 21600000
    AND received_bytes BETWEEN 0 AND bytes
  );
ALTER TABLE public.project_review_uploads
  DROP CONSTRAINT IF EXISTS project_review_uploads_status_check;
ALTER TABLE public.project_review_uploads
  ADD CONSTRAINT project_review_uploads_status_check
  CHECK (status IN ('starting', 'uploading', 'uploaded', 'saved', 'failed'));
ALTER TABLE public.project_review_uploads
  DROP CONSTRAINT IF EXISTS project_review_uploads_provider_check;
ALTER TABLE public.project_review_uploads
  ADD CONSTRAINT project_review_uploads_provider_check
  CHECK (provider IN ('youtube', 'google_drive'));

CREATE INDEX IF NOT EXISTS project_review_uploads_actor_expiry_idx
  ON public.project_review_uploads (actor_key, expires_at);
CREATE INDEX IF NOT EXISTS project_review_uploads_project_idx
  ON public.project_review_uploads (project_id);

ALTER TABLE public.project_review_versions
  ADD COLUMN IF NOT EXISTS provider varchar(20) NOT NULL DEFAULT 'cloudinary';
ALTER TABLE public.project_review_versions
  ADD COLUMN IF NOT EXISTS youtube_id varchar(11);
ALTER TABLE public.project_review_versions
  ADD COLUMN IF NOT EXISTS drive_file_id varchar(240);
ALTER TABLE public.project_review_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_review_versions
  DROP CONSTRAINT IF EXISTS project_review_versions_media_check;
ALTER TABLE public.project_review_versions
  ADD CONSTRAINT project_review_versions_media_check
  CHECK (
    mime IN ('video/mp4', 'video/webm')
    AND bytes BETWEEN 1 AND 10737418240
    AND duration_ms BETWEEN 1 AND 21600000
  );
ALTER TABLE public.project_review_versions
  DROP CONSTRAINT IF EXISTS project_review_versions_provider_check;
ALTER TABLE public.project_review_versions
  ADD CONSTRAINT project_review_versions_provider_check
  CHECK (
    (provider = 'cloudinary' AND youtube_id IS NULL AND drive_file_id IS NULL AND bytes <= 52428800)
    OR (provider = 'youtube' AND youtube_id IS NOT NULL AND drive_file_id IS NULL AND youtube_id ~ '^[A-Za-z0-9_-]{11}$')
    OR (provider = 'google_drive' AND youtube_id IS NULL AND drive_file_id ~ '^[A-Za-z0-9_-]{10,240}$')
  );
ALTER TABLE public.project_review_versions
  DROP CONSTRAINT IF EXISTS project_review_versions_decision_check;
ALTER TABLE public.project_review_versions
  ADD CONSTRAINT project_review_versions_decision_check
  CHECK (decision IN ('pending', 'approved', 'changes_requested'));

CREATE INDEX IF NOT EXISTS project_review_versions_project_created_idx
  ON public.project_review_versions (project_id, created_at, id);
CREATE UNIQUE INDEX IF NOT EXISTS project_review_versions_public_id_idx
  ON public.project_review_versions (public_id);

-- OAuth refresh tokens and resumable session URLs are server secrets. Keep
-- every review-storage table unavailable to browser and REST API roles.
REVOKE ALL PRIVILEGES ON TABLE
  public.video_storage_connections,
  public.project_review_uploads,
  public.project_review_versions
FROM PUBLIC, anon, authenticated, service_role;
