import { coairFetch } from "./client";
import type { AuditAction, AuditEntry } from "@/lib/admin/types";
import type {
    DunningCase,
    Invoice,
    InvoiceStatus,
    OveragePolicy,
    TopUpRequest,
} from "@/lib/admin/billingTypes";
import type { Coupon, TaxSettings, ApiKeyRecord, Announcement, FeatureFlag } from "@/lib/admin/wave2Types";

export type CoairInvoice = {
    id: string;
    company_id: string;
    amount_usd: number;
    status: InvoiceStatus;
    issued_at: string;
    due_at: string;
    description?: string;
};

export type CoairAuditEvent = {
    id: string;
    at: string;
    actor: string;
    action: string;
    target_type: AuditEntry["targetType"];
    target_id: string;
    target_label: string;
    detail: string;
};

export function mapInvoice(row: CoairInvoice): Invoice {
    return {
        id: row.id,
        companyId: row.company_id,
        amountUsd: row.amount_usd,
        status: row.status,
        issuedAt: row.issued_at,
        dueAt: row.due_at,
    };
}

export function mapAudit(row: CoairAuditEvent): AuditEntry {
    return {
        id: row.id,
        at: row.at,
        actor: row.actor,
        action: row.action as AuditAction,
        targetType: row.target_type,
        targetId: row.target_id,
        targetLabel: row.target_label,
        detail: row.detail,
    };
}

export async function listOrgInvoices(token: string) {
    const payload = await coairFetch<{ invoices: CoairInvoice[] }>("/org/invoices", {
        token,
    });
    return (payload.invoices ?? []).map(mapInvoice);
}

export async function createPurchase(
    token: string,
    body: {
        kind: "tokens" | "storage" | "upgrade" | "addon";
        amount_usd: number;
        tokens?: number;
        gb?: number;
        plan_id?: string;
        module_id?: string;
        description?: string;
    }
) {
    const payload = await coairFetch<CoairInvoice>("/org/purchases", {
        method: "POST",
        token,
        body,
    });
    return mapInvoice(payload);
}

export async function inviteOrgUser(
    token: string,
    input: { email: string; displayName?: string }
) {
    return coairFetch<{
        username: string;
        display_name?: string;
        invited?: boolean;
        email_sent?: boolean;
        email_error?: string | null;
        temporary_password?: string;
    }>("/org/invites", {
        method: "POST",
        token,
        body: { email: input.email, display_name: input.displayName },
    });
}

export async function listAdminInvoices(token: string) {
    const payload = await coairFetch<{ invoices: CoairInvoice[] }>(
        "/admin/invoices",
        { token }
    );
    return (payload.invoices ?? []).map(mapInvoice);
}

export async function createAdminInvoice(
    token: string,
    body: {
        org_id: string;
        amount_usd: number;
        status?: InvoiceStatus;
        description?: string;
    }
) {
    const payload = await coairFetch<CoairInvoice>("/admin/invoices", {
        method: "POST",
        token,
        body,
    });
    return mapInvoice(payload);
}

export async function retryInvoice(token: string, invoiceId: string) {
    const payload = await coairFetch<CoairInvoice>(
        `/admin/invoices/${encodeURIComponent(invoiceId)}/retry`,
        { method: "POST", token }
    );
    return mapInvoice(payload);
}

export async function refundInvoice(
    token: string,
    invoiceId: string,
    reason: string
) {
    const payload = await coairFetch<CoairInvoice>(
        `/admin/invoices/${encodeURIComponent(invoiceId)}/refund`,
        { method: "POST", token, body: { reason } }
    );
    return mapInvoice(payload);
}

export async function listAudit(token: string, action = "all") {
    const payload = await coairFetch<{ events: CoairAuditEvent[] }>(
        `/admin/audit?action=${encodeURIComponent(action)}`,
        { token }
    );
    return (payload.events ?? []).map(mapAudit);
}

export async function listCoupons(token: string) {
    const payload = await coairFetch<{
        coupons: Array<{
            id: string;
            code: string;
            discount_type: "percent" | "fixed";
            discount_value: number;
            active: boolean;
            created_at: string;
        }>;
    }>("/admin/coupons", { token });
    return (payload.coupons ?? []).map(
        (row): Coupon => ({
            id: row.id,
            code: row.code,
            discountType: row.discount_type,
            discountValue: row.discount_value,
            active: row.active,
            createdAt: row.created_at,
        })
    );
}

export async function createCoupon(
    token: string,
    input: { code: string; discountType: "percent" | "fixed"; discountValue: number }
) {
    return coairFetch("/admin/coupons", {
        method: "POST",
        token,
        body: {
            code: input.code,
            discount_type: input.discountType,
            discount_value: input.discountValue,
        },
    });
}

export async function toggleCoupon(token: string, couponId: string) {
    return coairFetch(`/admin/coupons/${encodeURIComponent(couponId)}/toggle`, {
        method: "POST",
        token,
    });
}

export async function readTax(token: string): Promise<TaxSettings> {
    const payload = await coairFetch<{ percent: number; region_label: string }>(
        "/admin/tax",
        { token }
    );
    return { percent: payload.percent, regionLabel: payload.region_label };
}

export async function writeTax(token: string, input: TaxSettings) {
    return coairFetch("/admin/tax", {
        method: "PUT",
        token,
        body: { percent: input.percent, region_label: input.regionLabel },
    });
}

export async function readOveragePolicy(token: string): Promise<OveragePolicy> {
    const payload = await coairFetch<{
        mode: OveragePolicy["mode"];
        trigger_pct: number;
        notes: string;
    }>("/admin/overage-policy", { token });
    return {
        mode: payload.mode,
        triggerPct: payload.trigger_pct,
        notes: payload.notes,
    };
}

export async function writeOveragePolicy(token: string, policy: OveragePolicy) {
    return coairFetch("/admin/overage-policy", {
        method: "PUT",
        token,
        body: {
            mode: policy.mode,
            trigger_pct: policy.triggerPct,
            notes: policy.notes ?? "",
        },
    });
}

export async function listDunning(token: string): Promise<DunningCase[]> {
    const payload = await coairFetch<{
        cases: Array<{
            id: string;
            company_id: string;
            status: DunningCase["status"];
            failed_at: string;
            grace_ends_at: string;
            attempt_count: number;
        }>;
    }>("/admin/dunning", { token });
    return (payload.cases ?? []).map((row) => ({
        id: row.id,
        companyId: row.company_id,
        status: row.status,
        failedAt: row.failed_at,
        graceEndsAt: row.grace_ends_at,
        attemptCount: row.attempt_count,
    }));
}

export async function retryDunning(token: string, caseId: string) {
    return coairFetch(`/admin/dunning/${encodeURIComponent(caseId)}/retry`, {
        method: "POST",
        token,
    });
}

export async function extendDunning(token: string, caseId: string) {
    return coairFetch(`/admin/dunning/${encodeURIComponent(caseId)}/extend`, {
        method: "POST",
        token,
    });
}

export type LiveSecurity = {
    mfaRequired: boolean;
    sessionTimeoutMinutes: number;
    ipAllowlist: string[];
    apiKeys: ApiKeyRecord[];
};

export async function readSecurity(token: string): Promise<LiveSecurity> {
    const payload = await coairFetch<{
        mfa_required: boolean;
        session_timeout_minutes: number;
        ip_allowlist: string[];
        api_keys: Array<{
            id: string;
            label: string;
            prefix: string;
            last_four: string;
            created_at: string;
            revoked_at?: string | null;
        }>;
    }>("/admin/security", { token });
    return {
        mfaRequired: payload.mfa_required,
        sessionTimeoutMinutes: payload.session_timeout_minutes,
        ipAllowlist: payload.ip_allowlist ?? [],
        apiKeys: (payload.api_keys ?? []).map((row) => ({
            id: row.id,
            label: row.label,
            prefix: row.prefix,
            lastFour: row.last_four,
            createdAt: row.created_at,
            revokedAt: row.revoked_at ?? undefined,
        })),
    };
}

export async function writeSecurity(
    token: string,
    body: { mfaRequired?: boolean; sessionTimeoutMinutes?: number }
) {
    return coairFetch("/admin/security", {
        method: "PUT",
        token,
        body: {
            mfa_required: body.mfaRequired,
            session_timeout_minutes: body.sessionTimeoutMinutes,
        },
    });
}

export async function addSecurityIp(token: string, entry: string) {
    return coairFetch("/admin/security/ip-allowlist", {
        method: "POST",
        token,
        body: { entry },
    });
}

export async function removeSecurityIp(token: string, entry: string) {
    return coairFetch(
        `/admin/security/ip-allowlist?entry=${encodeURIComponent(entry)}`,
        { method: "DELETE", token }
    );
}

export async function createSecurityApiKey(token: string, label: string) {
    return coairFetch<{ full_key: string; id: string; label: string }>(
        "/admin/security/api-keys",
        { method: "POST", token, body: { label } }
    );
}

export async function revokeSecurityApiKey(token: string, keyId: string) {
    return coairFetch(
        `/admin/security/api-keys/${encodeURIComponent(keyId)}/revoke`,
        { method: "POST", token }
    );
}

export async function forgotPassword(username: string) {
    return coairFetch<{ ok: boolean; reset_token?: string | null }>(
        "/auth/forgot-password",
        { method: "POST", body: { username } }
    );
}

export async function resetPassword(token: string, password: string) {
    return coairFetch("/auth/reset-password", {
        method: "POST",
        body: { token, password },
    });
}

export async function verifyMfa(mfaToken: string, code: string) {
    return coairFetch<{
        access_token: string;
        refresh_token?: string;
        user: { username: string; display_name: string; role: string };
    }>("/auth/mfa/verify", {
        method: "POST",
        body: { mfa_token: mfaToken, code },
    });
}

export function mapFeatureFlag(row: {
    id: string;
    key: string;
    label: string;
    enabled: boolean;
}): FeatureFlag {
    return {
        id: row.id,
        key: row.key,
        label: row.label,
        enabled: row.enabled,
    };
}

export function mapAnnouncement(row: {
    id: string;
    title: string;
    body: string;
    status: Announcement["status"];
    created_at: string;
    published_at?: string | null;
}): Announcement {
    return {
        id: row.id,
        title: row.title,
        body: row.body,
        status: row.status,
        createdAt: row.created_at,
        publishedAt: row.published_at ?? undefined,
    };
}

export function mapTopUpRequest(row: {
    id: string;
    company_id: string;
    tokens_requested: number;
    amount_usd: number;
    reason: string;
    status: TopUpRequest["status"];
    created_at: string;
    resolved_at?: string | null;
}): TopUpRequest {
    return {
        id: row.id,
        companyId: row.company_id,
        tokensRequested: row.tokens_requested,
        amountUsd: row.amount_usd,
        reason: row.reason,
        status: row.status,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at ?? undefined,
    };
}

export async function listFeatureFlags(token: string): Promise<FeatureFlag[]> {
    const payload = await coairFetch<{ flags: Parameters<typeof mapFeatureFlag>[0][] }>(
        "/admin/flags",
        { token }
    );
    return (payload.flags ?? []).map(mapFeatureFlag);
}

export async function writeFeatureFlag(
    token: string,
    flagId: string,
    enabled: boolean
) {
    const payload = await coairFetch<Parameters<typeof mapFeatureFlag>[0]>(
        `/admin/flags/${encodeURIComponent(flagId)}`,
        { method: "PUT", token, body: { enabled } }
    );
    return mapFeatureFlag(payload);
}

export async function readMaintenance(token: string) {
    return coairFetch<{ mode: boolean; message: string }>(
        "/admin/maintenance",
        { token }
    );
}

export async function writeMaintenance(
    token: string,
    input: { mode: boolean; message: string }
) {
    return coairFetch<{ mode: boolean; message: string }>(
        "/admin/maintenance",
        { method: "PUT", token, body: input }
    );
}

export async function listAnnouncements(token: string): Promise<Announcement[]> {
    const payload = await coairFetch<{
        announcements: Parameters<typeof mapAnnouncement>[0][];
    }>("/admin/announcements", { token });
    return (payload.announcements ?? []).map(mapAnnouncement);
}

export async function createAnnouncement(
    token: string,
    input: { title: string; body: string }
) {
    const payload = await coairFetch<Parameters<typeof mapAnnouncement>[0]>(
        "/admin/announcements",
        { method: "POST", token, body: input }
    );
    return mapAnnouncement(payload);
}

export async function publishAnnouncement(token: string, id: string) {
    const payload = await coairFetch<Parameters<typeof mapAnnouncement>[0]>(
        `/admin/announcements/${encodeURIComponent(id)}/publish`,
        { method: "POST", token }
    );
    return mapAnnouncement(payload);
}

export async function archiveAnnouncement(token: string, id: string) {
    const payload = await coairFetch<Parameters<typeof mapAnnouncement>[0]>(
        `/admin/announcements/${encodeURIComponent(id)}/archive`,
        { method: "POST", token }
    );
    return mapAnnouncement(payload);
}

export async function listAdminTopups(token: string): Promise<TopUpRequest[]> {
    const payload = await coairFetch<{
        requests: Parameters<typeof mapTopUpRequest>[0][];
    }>("/admin/topups", { token });
    return (payload.requests ?? []).map(mapTopUpRequest);
}

export async function approveAdminTopup(token: string, id: string) {
    const payload = await coairFetch<Parameters<typeof mapTopUpRequest>[0]>(
        `/admin/topups/${encodeURIComponent(id)}/approve`,
        { method: "POST", token }
    );
    return mapTopUpRequest(payload);
}

export async function denyAdminTopup(token: string, id: string) {
    const payload = await coairFetch<Parameters<typeof mapTopUpRequest>[0]>(
        `/admin/topups/${encodeURIComponent(id)}/deny`,
        { method: "POST", token }
    );
    return mapTopUpRequest(payload);
}

export async function listOrgTopups(token: string): Promise<TopUpRequest[]> {
    const payload = await coairFetch<{
        requests: Parameters<typeof mapTopUpRequest>[0][];
    }>("/org/topups", { token });
    return (payload.requests ?? []).map(mapTopUpRequest);
}

export async function createOrgTopup(
    token: string,
    input: { tokens: number; amountUsd: number; reason: string }
) {
    const payload = await coairFetch<Parameters<typeof mapTopUpRequest>[0]>(
        "/org/topups",
        {
            method: "POST",
            token,
            body: {
                tokens: input.tokens,
                amount_usd: input.amountUsd,
                reason: input.reason,
            },
        }
    );
    return mapTopUpRequest(payload);
}

export async function readPlatformStatus(token: string) {
    return coairFetch<{
        maintenance_mode: boolean;
        maintenance_message: string;
        flags: Record<string, boolean>;
        announcements: Parameters<typeof mapAnnouncement>[0][];
    }>("/org/platform-status", { token });
}
