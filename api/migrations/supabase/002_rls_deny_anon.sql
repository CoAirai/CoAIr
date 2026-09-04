-- Deny direct table access for anon/authenticated roles.
-- Supabase service_role / BYPASSRLS connections used by the API still work.
-- Safe to re-run.

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'users',
        'user_usage',
        'billing_accounts',
        'billing_ledger',
        'storage_objects',
        'organizations',
        'org_members',
        'projects',
        'project_members',
        'project_vector_state',
        'audit_events',
        'invoices',
        'coupons',
        'tax_settings',
        'overage_policy',
        'dunning_cases',
        'security_settings',
        'ip_allowlist',
        'api_keys',
        'password_resets',
        'mfa_challenges',
        'email_outbox',
        'feature_flags',
        'platform_settings',
        'announcements',
        'topup_requests',
        'member_token_requests',
        'tickets',
        'packages',
        'token_economics',
        'access_requests',
        'org_subscriptions',
        'stripe_fulfillments'
    ]
    LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
            -- No policies => deny for anon/authenticated.
            -- Table owners / roles with BYPASSRLS (service_role) still work.
        END IF;
    END LOOP;
END $$;
