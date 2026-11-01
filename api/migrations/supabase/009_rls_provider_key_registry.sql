-- Keep the registry backend-only on Supabase and standalone PostgreSQL.
-- Standalone installations do not create Supabase's PostgREST roles.
ALTER TABLE public.provider_key_registry ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE public.provider_key_registry FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE public.provider_key_registry FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT ALL ON TABLE public.provider_key_registry TO service_role;
    END IF;
END $$;
