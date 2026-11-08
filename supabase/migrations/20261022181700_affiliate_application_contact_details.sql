ALTER TABLE public.affiliate_applications
  DROP CONSTRAINT IF EXISTS affiliate_applications_content_check;

ALTER TABLE public.affiliate_applications
  ALTER COLUMN channel_url DROP NOT NULL,
  ALTER COLUMN audience DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_phone varchar(32),
  ADD COLUMN IF NOT EXISTS social_media text;

ALTER TABLE public.affiliate_applications
  ADD CONSTRAINT affiliate_applications_content_check CHECK (
    (channel_url IS NULL OR length(btrim(channel_url)) BETWEEN 8 AND 512)
    AND (audience IS NULL OR length(btrim(audience)) BETWEEN 2 AND 4000)
    AND length(btrim(promotion_plan)) BETWEEN 2 AND 4000
    AND (whatsapp_phone IS NULL OR whatsapp_phone ~ '^\+[1-9][0-9]{6,14}$')
    AND (social_media IS NULL OR length(social_media) <= 2000)
  );
