-- Contact messages are written through the authenticated server role, so the
-- browser-facing INSERT policy is no longer needed.
DROP POLICY IF EXISTS "Anyone can submit a contact message" ON public.contact_messages;

-- This function is invoked by its DDL event trigger, not through the Data API.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
