import { CoairApiError, coairFetch } from "./client";
import {
    mapAccessRequest,
    mapPlan,
    mapTicket,
    mapTokenEconomics,
    planToPayload,
    type CoairAccessRequestPayload,
    type CoairPlanPayload,
    type CoairTicketPayload,
    type CoairTokenEconomicsPayload,
} from "./mapCommerce";
import type { Plan } from "@/lib/admin/types";

function apiErrorMessage(error: unknown) {
    if (error instanceof CoairApiError) {
        try {
            const parsed = JSON.parse(error.body) as { detail?: string };
            if (parsed.detail) return String(parsed.detail);
        } catch {
            /* body is plain text */
        }
        return error.message;
    }
    return error instanceof Error ? error.message : "Request failed";
}

export async function listTickets(token: string) {
    const payload = await coairFetch<{ tickets: CoairTicketPayload[] }>(
        "/tickets",
        { token }
    );
    return (payload.tickets ?? []).map(mapTicket);
}

export async function createTicket(
    token: string,
    input: { subject: string; priority: "low" | "medium" | "high"; message: string }
) {
    const payload = await coairFetch<CoairTicketPayload>("/tickets", {
        method: "POST",
        token,
        body: input,
    });
    return mapTicket(payload);
}

export async function listAdminTickets(token: string) {
    const payload = await coairFetch<{ tickets: CoairTicketPayload[] }>(
        "/admin/tickets",
        { token }
    );
    return (payload.tickets ?? []).map(mapTicket);
}

export async function patchAdminTicket(
    token: string,
    ticketId: string,
    body: { assignee_id?: string | null; status?: "open" | "resolved" }
) {
    const payload = await coairFetch<CoairTicketPayload>(
        `/admin/tickets/${encodeURIComponent(ticketId)}`,
        { method: "PATCH", token, body }
    );
    return mapTicket(payload);
}

export async function listPackages(token: string) {
    const payload = await coairFetch<{ plans: CoairPlanPayload[] }>("/packages", {
        token,
    });
    return (payload.plans ?? []).map(mapPlan);
}

export async function patchPackage(token: string, plan: Plan) {
    const payload = await coairFetch<CoairPlanPayload>(
        `/admin/packages/${encodeURIComponent(plan.id)}`,
        { method: "PATCH", token, body: planToPayload(plan) }
    );
    return mapPlan(payload);
}

export async function readTokenEconomics(token: string) {
    const payload = await coairFetch<CoairTokenEconomicsPayload>(
        "/admin/token-economics",
        { token }
    );
    return mapTokenEconomics(payload);
}

export async function writeTokenEconomics(
    token: string,
    input: { providerTokensPerUsd: number; sellTokensPerUsd: number }
) {
    const payload = await coairFetch<CoairTokenEconomicsPayload>(
        "/admin/token-economics",
        {
            method: "PUT",
            token,
            body: {
                provider_tokens_per_usd: input.providerTokensPerUsd,
                sell_tokens_per_usd: input.sellTokensPerUsd,
            },
        }
    );
    return mapTokenEconomics(payload);
}

export async function createAccessRequest(input: {
    fullName: string;
    email: string;
    companyName: string;
    emailVerificationToken: string;
}) {
    try {
        const payload = await coairFetch<CoairAccessRequestPayload>(
            "/access-requests",
            {
                method: "POST",
                body: {
                    full_name: input.fullName,
                    email: input.email,
                    company_name: input.companyName,
                    email_verification_token: input.emailVerificationToken,
                },
            }
        );
        return { ok: true as const, request: mapAccessRequest(payload) };
    } catch (error) {
        return {
            ok: false as const,
            kind: error instanceof CoairApiError && error.status === 0
                ? ("unreachable" as const)
                : ("invalid" as const),
            error: apiErrorMessage(error),
        };
    }
}

export async function sendSignupEmailCode(email: string) {
    return coairFetch<{
        challenge_id: string;
        email: string;
        purpose: string;
        debug_code?: string;
    }>("/auth/email/send-code", {
        method: "POST",
        body: { email, purpose: "signup" },
    });
}

export async function verifySignupEmailCode(challengeId: string, code: string) {
    return coairFetch<{
        email: string;
        purpose: string;
        verification_token: string;
    }>("/auth/email/verify-code", {
        method: "POST",
        body: { challenge_id: challengeId, code },
    });
}

export async function resendInviteCode(input: {
    email?: string;
    token?: string;
}) {
    return coairFetch<{
        ok: boolean;
        challenge_id?: string;
        email?: string;
        debug_code?: string;
        debug_invite_token?: string;
    }>("/auth/invite/resend-code", {
        method: "POST",
        body: {
            email: input.email || "",
            token: input.token || "",
        },
    });
}

export async function previewInvite(token: string) {
    return coairFetch<{
        email: string;
        email_hint: string;
        display_name: string;
        org_id?: string;
    }>(`/auth/invite/preview?token=${encodeURIComponent(token)}`);
}

export async function activateInvite(input: {
    token: string;
    password: string;
    code?: string;
    email?: string;
    orgId?: string;
    emailVerificationToken?: string;
    challengeId?: string;
}) {
    return coairFetch<{ ok: boolean; username: string; message: string }>(
        "/auth/invite/activate",
        {
            method: "POST",
            body: {
                token: input.token,
                password: input.password,
                code: input.code || "",
                email: input.email || "",
                org_id: input.orgId || "",
                email_verification_token: input.emailVerificationToken || "",
                challenge_id: input.challengeId || "",
            },
        }
    );
}

export async function listAccessRequests(token: string) {
    const payload = await coairFetch<{ requests: CoairAccessRequestPayload[] }>(
        "/admin/access-requests",
        { token }
    );
    return (payload.requests ?? []).map(mapAccessRequest);
}

export async function approveAccessRequest(token: string, requestId: string) {
    return coairFetch<{
        request: CoairAccessRequestPayload;
        org: { org_id: string; name: string };
        owner: { username: string; invited?: boolean; temporary_password?: string };
    }>(`/admin/access-requests/${encodeURIComponent(requestId)}/approve`, {
        method: "POST",
        token,
    });
}

export async function denyAccessRequest(token: string, requestId: string) {
    const payload = await coairFetch<CoairAccessRequestPayload>(
        `/admin/access-requests/${encodeURIComponent(requestId)}/deny`,
        { method: "POST", token }
    );
    return mapAccessRequest(payload);
}

export type PricingPreview = {
    base_usd: number;
    discount_usd: number;
    subtotal_usd: number;
    tax_percent: number;
    tax_usd: number;
    total_usd: number;
    coupon_code: string;
    region_label: string;
};

export async function readOrgTax(token: string) {
    return coairFetch<{ percent: number; region_label: string }>("/org/tax", {
        token,
    });
}

export async function previewPricing(
    token: string,
    input: { amount_usd: number; coupon_code?: string }
) {
    return coairFetch<PricingPreview>("/org/pricing/preview", {
        method: "POST",
        token,
        body: {
            amount_usd: input.amount_usd,
            coupon_code: input.coupon_code?.trim() || undefined,
        },
    });
}

export async function checkoutPlan(
    token: string,
    planId: string,
    options: { coupon_code?: string } = {}
) {
    const payload = await coairFetch<{
        checkout_url?: string;
        session_id?: string;
        subscription?: { plan_id: string; needs_checkout: boolean };
        plan?: { id: string; name: string };
        invoice?: { id: string };
        pricing?: PricingPreview;
    }>("/org/checkout", {
        method: "POST",
        token,
        body: {
            plan_id: planId,
            coupon_code: options.coupon_code?.trim() || undefined,
        },
    });
    if (payload.checkout_url && typeof window !== "undefined") {
        window.location.assign(payload.checkout_url);
        return { redirected: true as const, ...payload };
    }
    return { redirected: false as const, ...payload };
}

export async function confirmCheckout(token: string, sessionId: string) {
    return coairFetch<{
        subscription: { plan_id: string; needs_checkout: boolean };
        plan?: { id: string; name: string };
    }>("/org/checkout/confirm", {
        method: "POST",
        token,
        body: { session_id: sessionId },
    });
}

export async function cancelOrgSubscription(
    token: string,
    options: { immediate?: boolean } = {}
) {
    return coairFetch<{
        subscription: {
            plan_id?: string;
            auto_renew?: boolean;
            cancel_at_period_end?: boolean;
            status?: string;
            current_period_end?: string | null;
        };
        immediate: boolean;
    }>("/org/subscription/cancel", {
        method: "POST",
        token,
        body: { immediate: Boolean(options.immediate) },
    });
}

export async function resumeOrgSubscription(token: string) {
    return coairFetch<{
        subscription: {
            plan_id?: string;
            auto_renew?: boolean;
            cancel_at_period_end?: boolean;
            status?: string;
            current_period_end?: string | null;
        };
    }>("/org/subscription/resume", {
        method: "POST",
        token,
    });
}

export { apiErrorMessage };
