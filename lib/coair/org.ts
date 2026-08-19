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
