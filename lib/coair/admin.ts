import { coairFetch } from "./client";
import { weekWindows } from "@/lib/admin/liveHelpers";
import type { ChartPoint } from "@/lib/admin/dashboardSeries";
import type { CoairMemberTokenRequest, CoairTokenPool } from "./org";

export type CoairOrgSubscription = {
    plan_id: string;
    needs_checkout?: boolean;
    sell_tokens_per_usd_override?: number | null;
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
    status?: string;
    cancel_at_period_end?: boolean;
    current_period_end?: string | null;
    auto_renew?: boolean;
    org_id?: string;
    org_name?: string | null;
};

export type CoairAdminOrg = {
    org_id: string;
    name: string;
    slug?: string;
    created_at?: string;
    archived_at?: string | null;
    default_plan_type?: string;
    default_credits?: number;
    default_token_limit?: number;
    default_storage_bytes?: number;
    project_limit?: number;
    allow_member_projects?: boolean;
    subscription?: CoairOrgSubscription;
    counts?: {
        members?: number;
        owners?: number;
        projects?: number;
    };
};

export type CoairOrgMember = {
    username: string;
    role: string;
    created_at?: string;
};

export type CoairOrgProject = {
    project_id: string;
    name: string;
    member_count?: number;
    created_at?: string;
    updated_at?: string;
    archived_at?: string | null;
};

export type CoairAdminOrgDetail = CoairAdminOrg & {
    members?: CoairOrgMember[];
    projects?: CoairOrgProject[];
    token_pool?: CoairTokenPool;
};

export type CoairAdminUser = {
    id?: number;
    username: string;
    display_name?: string;
    role?: string;
    is_active?: boolean;
    org_id?: string | null;
    org_name?: string | null;
    org_role?: string | null;
    used_tokens?: number;
    token_limit?: number;
    credits_remaining?: number;
    credits_total?: number;
    credits_used?: number;
    storage_used_bytes?: number;
    storage_limit_bytes?: number;
    storage_percent_used?: number;
    plan_type?: string;
    model_policy?: string;
    markup_percent?: number;
    total_calls?: number;
    features?: Record<string, boolean>;
};

export type CoairUsageSnapshot = {
    used_usd?: number;
    limit_usd?: number;
    remaining_usd?: number;
    remaining_pct?: number;
    total_tokens?: number;
    total_calls?: number;
};

export type CoairBillingGroup = {
    project_id?: string;
    username?: string;
    provider?: string;
    model?: string;
    task_type?: string;
    calls?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    estimated_provider_cost_usd?: number;
    retail_credit?: number;
};

export type CoairLedgerEntry = {
    event_id: string;
    event_type: string;
    created_at: string;
    username?: string;
    project_id?: string;
    model?: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    retail_credit?: number;
    debited_credit?: number;
    note?: string;
};

export type CoairJargonTerm = {
    abbreviation: string;
    full_form: string;
    concept_group?: string | null;
};

export type CoairDataTablesStatus = {
    total_data_files: number;
    registered: number;
    no_schema_match: number;
    error: number;
    pending: number;
    duckdb_tables_loaded: number;
    catalog_entries: number;
    parquet_files: number;
};

export type CoairFlywheelStatus = {
    golden_rows?: number;
    learned_routing_examples?: number;
    feedback?: { total?: number };
};

export async function listAdminOrgs(token: string, includeArchived = true) {
    const query = includeArchived ? "?include_archived=true" : "";
    return coairFetch<{ orgs: CoairAdminOrg[] }>(`/admin/orgs${query}`, {
        token,
    });
}

export async function createAdminOrg(
    token: string,
    body: {
        name: string;
        owner_username?: string;
        owner_email?: string;
        owner_display_name?: string;
        default_plan_type?: "demo" | "legacy";
        default_credits?: number;
        default_token_limit?: number;
        default_storage_bytes?: number;
        project_limit?: number;
        allow_member_projects?: boolean;
    }
) {
    return coairFetch<CoairAdminOrg>("/admin/orgs", {
        method: "POST",
        token,
        body,
        timeoutMs: 60000,
    });
}

export async function readAdminOrg(token: string, orgId: string) {
    return coairFetch<CoairAdminOrgDetail>(
        `/admin/orgs/${encodeURIComponent(orgId)}`,
        { token }
    );
}

export async function assignAdminOrgPlan(
    token: string,
    orgId: string,
    input: {
        plan_id: "demo" | "foundation" | "pro" | "enterprise" | "custom";
        record_invoice?: boolean;
    }
) {
    return coairFetch<{
        subscription?: CoairOrgSubscription;
        plan?: { id: string; name: string };
        invoice?: { id: string };
    }>(`/admin/orgs/${encodeURIComponent(orgId)}/assign-plan`, {
        method: "POST",
        token,
        body: input,
    });
}

export async function listAdminSubscriptions(token: string) {
    return coairFetch<{ subscriptions: CoairOrgSubscription[] }>(
        "/admin/subscriptions",
        { token }
    );
}

export type CoairAdminTokenPool = CoairTokenPool & {
    org_name?: string;
    archived_at?: string | null;
    subscription?: CoairOrgSubscription;
};

export async function listAdminTokenPools(token: string) {
    return coairFetch<{ pools: CoairAdminTokenPool[] }>("/admin/token-pools", {
        token,
    });
}

export type CoairAdminTokenRequest = CoairMemberTokenRequest & {
    org_name?: string | null;
};

export async function listAdminTokenRequests(
    token: string,
    status?: string
) {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return coairFetch<{ requests: CoairAdminTokenRequest[] }>(
        `/admin/token-requests${query}`,
        { token }
    );
}

export async function patchAdminOrg(
    token: string,
    orgId: string,
    body: {
        archived?: boolean;
        name?: string;
        default_plan_type?: "demo" | "legacy";
        default_credits?: number;
        default_token_limit?: number;
        default_storage_bytes?: number;
        project_limit?: number;
        allow_member_projects?: boolean;
    }
) {
    return coairFetch<CoairAdminOrg>(
        `/admin/orgs/${encodeURIComponent(orgId)}`,
        { method: "PATCH", token, body }
    );
}

export async function addAdminOrgMember(
    token: string,
    orgId: string,
    username: string,
    role: "owner" | "member" = "member"
) {
    return coairFetch<{ ok: boolean; members: CoairOrgMember[] }>(
        `/admin/orgs/${encodeURIComponent(orgId)}/members`,
        { method: "POST", token, body: { username, role } }
    );
}

export async function removeAdminOrgMember(
    token: string,
    orgId: string,
    username: string
) {
    return coairFetch(
        `/admin/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(username)}`,
        { method: "DELETE", token }
    );
}

export async function listAdminUsers(
    token: string,
    orgId?: string,
    q?: string,
    includeInactive = false
) {
    const params = new URLSearchParams();
    if (orgId) params.set("org_id", orgId);
    if (q) params.set("q", q);
    if (includeInactive) params.set("include_inactive", "true");
    const query = params.toString() ? `?${params.toString()}` : "";
    return coairFetch<{ users: CoairAdminUser[]; total?: number }>(
        `/admin/users${query}`,
        { token }
    );
}

export async function createAdminUser(
    token: string,
    body: {
        username: string;
        password?: string;
        display_name?: string;
        org_id?: string;
        role?: string;
        token_limit?: number;
        plan_type?: "demo" | "legacy";
        initial_credits?: number;
        storage_limit_bytes?: number;
        model_policy?: string;
    }
) {
    return coairFetch<CoairAdminUser>("/admin/users", {
        method: "POST",
        token,
        body,
    });
}

export async function patchAdminUser(
    token: string,
    username: string,
    body: {
        display_name?: string;
        role?: string;
        is_active?: boolean;
        token_limit?: number;
        plan_type?: "demo" | "legacy";
        markup_percent?: number;
        storage_limit_bytes?: number;
        model_policy?: string;
        password?: string;
        features?: Record<string, boolean>;
    }
) {
    return coairFetch<CoairAdminUser>(
        `/admin/users/${encodeURIComponent(username)}`,
        { method: "PATCH", token, body }
    );
}

export async function setAdminUserActive(
    token: string,
    username: string,
    isActive: boolean
) {
    return patchAdminUser(token, username, { is_active: isActive });
}

export async function adjustAdminCredits(
    token: string,
    username: string,
    body: { credits: number; reason: string; idempotency_key?: string }
) {
    return coairFetch(`/admin/users/${encodeURIComponent(username)}/credits`, {
        method: "POST",
        token,
        body,
    });
}

export async function readAdminUserLedger(token: string, username: string) {
    return coairFetch<{ entries: CoairLedgerEntry[]; total: number }>(
        `/admin/users/${encodeURIComponent(username)}/ledger`,
        { token }
    );
}

export async function resetAdminUserUsage(token: string, username: string) {
    return coairFetch(`/admin/users/${encodeURIComponent(username)}/reset-usage`, {
        method: "POST",
        token,
    });
}

export async function deleteAdminUser(token: string, username: string) {
    return coairFetch(`/admin/users/${encodeURIComponent(username)}`, {
        method: "DELETE",
        token,
    });
}

export async function impersonateAdminUser(token: string, username: string) {
    return coairFetch<{
        access_token: string;
        refresh_token?: string;
        impersonator: string;
        user: {
            username: string;
            display_name: string;
            role: string;
            features?: Record<string, boolean>;
        };
    }>(`/admin/users/${encodeURIComponent(username)}/impersonate`, {
        method: "POST",
        token,
    });
}

export async function forceLogoutAdminUser(token: string, username: string) {
    return coairFetch<{ username: string; token_epoch: number; ok: boolean }>(
        `/admin/users/${encodeURIComponent(username)}/force-logout`,
        { method: "POST", token }
    );
}

export async function listAdminUsage(
    token: string,
    filters: {
        username?: string;
        projectId?: string;
        dateFrom?: string;
        dateTo?: string;
    } = {}
) {
    const params = new URLSearchParams();
    if (filters.username) params.set("username", filters.username);
    if (filters.projectId) params.set("project_id", filters.projectId);
    if (filters.dateFrom) params.set("date_from", filters.dateFrom);
    if (filters.dateTo) params.set("date_to", filters.dateTo);
    const query = params.toString() ? `?${params.toString()}` : "";
    return coairFetch<{ groups: CoairBillingGroup[] }>(`/admin/usage${query}`, {
        token,
    });
}

export async function loadWeeklySpend(token: string, count = 8): Promise<ChartPoint[]> {
    const windows = weekWindows(count);
    return Promise.all(
        windows.map(async (week) => {
            const payload = await listAdminUsage(token, {
                dateFrom: week.from,
                dateTo: week.to,
            });
            const value = (payload.groups ?? []).reduce(
                (sum, group) => sum + (group.estimated_provider_cost_usd ?? 0),
                0
            );
            return { label: week.label, value: Number(value.toFixed(2)) };
        })
    );
}

export async function readPlatformUsage(token: string) {
    return coairFetch<CoairUsageSnapshot>("/usage", { token });
}

export async function resetPlatformUsage(token: string) {
    return coairFetch<CoairUsageSnapshot>("/usage/reset", {
        method: "POST",
        token,
    });
}

export async function readDataTablesStatus(token: string) {
    return coairFetch<CoairDataTablesStatus>("/admin/data-tables/status", {
        token,
    });
}

export async function reindexDataTables(token: string, dryRun = false) {
    return coairFetch<{ scheduled?: number; dry_run?: boolean; total_targets?: number }>(
        "/admin/data-tables/reindex",
        { method: "POST", token, body: { dry_run: dryRun } }
    );
}

export async function readFlywheelStatus(token: string) {
    return coairFetch<CoairFlywheelStatus>("/admin/flywheel/status", { token });
}

export async function applyFlywheel(token: string) {
    return coairFetch<{ ok: boolean }>("/admin/flywheel/apply", {
        method: "POST",
        token,
    });
}

export async function listJargon(token: string) {
    return coairFetch<{
        builtin_count: number;
        custom_count: number;
        custom: CoairJargonTerm[];
        builtin_sample: CoairJargonTerm[];
    }>("/admin/jargon", { token });
}

export async function addJargonTerm(
    token: string,
    body: { abbreviation: string; full_form: string; concept_group?: string }
) {
    return coairFetch<CoairJargonTerm>("/admin/jargon", {
        method: "POST",
        token,
        body,
    });
}

export async function deleteJargonTerm(token: string, abbreviation: string) {
    return coairFetch(`/admin/jargon/${encodeURIComponent(abbreviation)}`, {
        method: "DELETE",
        token,
    });
}

export async function reloadJargon(token: string) {
    return coairFetch<{ reloaded: number }>("/admin/jargon/reload", {
        method: "POST",
        token,
    });
}
