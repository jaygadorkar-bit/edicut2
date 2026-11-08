ALTER TABLE public.customer_subscriptions
  ADD COLUMN IF NOT EXISTS payment_provider varchar(16),
  ADD COLUMN IF NOT EXISTS cryptomus_invoice_uuid varchar(64),
  ADD COLUMN IF NOT EXISTS cryptomus_payment_url varchar(512),
  ADD COLUMN IF NOT EXISTS cryptomus_invoice_expires_at timestamptz;

ALTER TABLE public.customer_subscriptions
  DROP CONSTRAINT IF EXISTS customer_subscriptions_status_check,
  DROP CONSTRAINT IF EXISTS customer_subscriptions_payment_provider_check,
  DROP CONSTRAINT IF EXISTS customer_subscriptions_cryptomus_invoice_check;

ALTER TABLE public.customer_subscriptions
  ADD CONSTRAINT customer_subscriptions_payment_provider_check
    CHECK (payment_provider IS NULL OR payment_provider = 'cryptomus'),
  ADD CONSTRAINT customer_subscriptions_cryptomus_invoice_check
    CHECK (
      (payment_provider IS NULL AND cryptomus_invoice_uuid IS NULL AND cryptomus_payment_url IS NULL AND cryptomus_invoice_expires_at IS NULL)
      OR (
        payment_provider = 'cryptomus'
        AND (
          (cryptomus_invoice_uuid IS NULL AND cryptomus_payment_url IS NULL AND cryptomus_invoice_expires_at IS NULL)
          OR (cryptomus_invoice_uuid IS NOT NULL AND cryptomus_payment_url IS NOT NULL AND cryptomus_invoice_expires_at IS NOT NULL)
        )
      )
    ),
  ADD CONSTRAINT customer_subscriptions_status_check
    CHECK (
      (status = 'unpaid' AND paid_at IS NULL AND paid_by IS NULL)
      OR (
        status = 'paid' AND paid_at IS NOT NULL AND deleted_at IS NULL
        AND (paid_by IS NOT NULL OR (payment_provider = 'cryptomus' AND cryptomus_invoice_uuid IS NOT NULL))
      )
    );

CREATE UNIQUE INDEX IF NOT EXISTS customer_subscriptions_cryptomus_invoice_idx
  ON public.customer_subscriptions (cryptomus_invoice_uuid)
  WHERE cryptomus_invoice_uuid IS NOT NULL;
