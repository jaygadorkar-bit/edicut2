-- Contact messages are written through the authenticated server role, so the
-- browser-facing INSERT policy is no longer needed.
DROP POLICY IF EXISTS "Anyone can submit a contact message" ON public.contact_messages;

-- This function is invoked by its DDL event trigger, not through the Data API.
-- Some hosted projects provision the event-trigger helper outside this repo;
-- clean local databases do not. Keep the hardening when present without making
-- a fresh migration run depend on undocumented hosted state.
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated';
  END IF;
END;
$$;
