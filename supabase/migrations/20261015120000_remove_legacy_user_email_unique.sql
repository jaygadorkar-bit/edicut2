-- Keep the Supabase schema aligned with packages/db/src/schema.ts and the
-- existing Neon database. App users may share an email address.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_email_key;

-- Also remove the legacy standalone index if a database has that shape.
DROP INDEX IF EXISTS public.users_email_key;
