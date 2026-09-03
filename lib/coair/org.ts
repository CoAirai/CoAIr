import { coairFetch } from "./client";
import type { CoairOrgResponse } from "./types";

export type CoairOrgUser = {
    username: string;
    display_name?: string;
    org_role?: string;
    is_active?: boolean;
    used_tokens?: number;
    token_limit?: number;
    credits_remaining?: number;
    credits_total?: number;
    percent_remaining?: number;
    storage_used_bytes?: number;
    storage_limit_bytes?: number;
    project_count?: number;
    features?: Record<string, boolean>;
};

export type CoairOrgUsageGroup = {
    project_id?: string;
    username?: string;
    provider?: string;
    model?: string;
    calls?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    debited_credit?: number;
};

export type CoairOrgUsage = {
    groups: CoairOrgUsageGroup[];
    totals?: {
        calls?: number;
        prompt_tokens?: number;
        completion_tokens?: number;
        credits_used?: number;
    };
};

export async function readOrg(token: string) {
    return coairFetch<CoairOrgResponse>("/org", { token });
}

export async function readOrgUsage(token: string) {
    return coairFetch<CoairOrgUsage>("/org/usage", { token });
}

export async function listOrgUsers(token: string) {
    return coairFetch<{ users: CoairOrgUser[] }>("/org/users", { token });
}

export async function createOrgUser(
    token: string,
    input: { username: string; password?: string; display_name?: string }
) {
    return coairFetch<CoairOrgUser>("/org/users", {
        method: "POST",
        token,
        body: input,
    });
}

export async function patchOrgUser(
    token: string,
    username: string,
    body: {
        display_name?: string;
        is_active?: boolean;
        org_role?: "owner" | "member";
        features?: Record<string, boolean>;
        password?: string;
    }
) {
    return coairFetch<CoairOrgUser>(
        `/org/users/${encodeURIComponent(username)}`,
        { method: "PATCH", token, body }
    );
}

export async function deactivateOrgUser(token: string, username: string) {
    return coairFetch<void>(`/org/users/${encodeURIComponent(username)}`, {
        method: "DELETE",
        token,
    });
}

export async function readAuthMe(token: string) {
    return coairFetch<{
        user: {
            username?: string;
            display_name?: string;
            features?: Record<string, boolean>;
            used_tokens?: number;
            token_limit?: number;
            credits_remaining?: number;
            credits_total?: number;
            storage_used_bytes?: number;
            storage_limit_bytes?: number;
            percent_remaining?: number;
            credit_percent_remaining?: number;
        };
    }>("/auth/me", { token });
}

export type CoairTokenPool = {
    org_id: string;
    pool: number;
    total_used: number;
    remaining: number;
    member_count: number;
    equal_share: number;
    members: Array<{
        username: string;
        display_name?: string;
        used_tokens: number;
        token_limit: number;
        remaining: number;
    }>;
};

export type CoairMemberTokenRequest = {
    id: string;
    org_id: string;
    username: string;
    tokens: number;
    reason: string;
    status: string;
    created_at: string;
    resolved_at?: string | null;
    resolved_by?: string | null;
    fulfill_mode?: string | null;
    donor_username?: string | null;
    purchase_session_id?: string | null;
};

export async function readOrgTokenPool(token: string) {
    return coairFetch<CoairTokenPool>("/org/token-pool", { token });
}

export async function listMemberTokenRequests(token: string) {
    return coairFetch<{ requests: CoairMemberTokenRequest[] }>(
        "/org/token-requests",
        { token }
    );
}

export async function createMemberTokenRequest(
    token: string,
    body: { tokens: number; reason?: string }
) {
    return coairFetch<CoairMemberTokenRequest>("/org/token-requests", {
        method: "POST",
        token,
        body,
    });
}

export async function approveMemberTokenRequest(
    token: string,
    requestId: string,
    body: {
        mode: "transfer" | "purchase";
        from_username?: string;
        tokens?: number;
        amount_usd?: number;
    }
) {
    return coairFetch<{
        request?: CoairMemberTokenRequest;
        transfer?: {
            tokens: number;
            from_username: string;
            to_username: string;
        };
        invoice?: { id: string };
        checkout?: { url?: string; id?: string };
    }>(`/org/token-requests/${encodeURIComponent(requestId)}/approve`, {
        method: "POST",
        token,
        body,
    });
}

export async function denyMemberTokenRequest(token: string, requestId: string) {
    return coairFetch<CoairMemberTokenRequest>(
        `/org/token-requests/${encodeURIComponent(requestId)}/deny`,
        { method: "POST", token }
    );
}

export async function updateMyNotificationPrefs(
    token: string,
    prefs: { responses: boolean; push: boolean; email: boolean }
) {
    return coairFetch<{ features: Record<string, boolean> }>(
        "/auth/me/notifications",
        {
            method: "PATCH",
            token,
            body: {
                notify_responses: prefs.responses,
                notify_push: prefs.push,
                notify_email: prefs.email,
            },
        }
    );
}

export async function updateMyProfile(
    token: string,
    body: {
        display_name?: string;
        phone?: string;
        improve_model?: boolean;
        mfa_enabled?: boolean;
    }
) {
    return coairFetch<{
        user: {
            username?: string;
            display_name?: string;
            features?: Record<string, unknown>;
        };
    }>("/auth/me", { method: "PATCH", token, body });
}
