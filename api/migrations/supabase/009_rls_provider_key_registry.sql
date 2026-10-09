-- provider_key_registry was added in 008 without RLS. Match 002_rls_deny_anon:
-- enable RLS with no policies so anon/authenticated cannot access via PostgREST.
-- API uses service_role / BYPASSRLS and is unaffected.

ALTER TABLE public.provider_key_registry ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.provider_key_registry FROM anon, authenticated;
GRANT ALL ON TABLE public.provider_key_registry TO service_role;
