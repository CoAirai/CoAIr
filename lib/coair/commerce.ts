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

export async function checkoutPlan(token: string, planId: string) {
    const payload = await coairFetch<{
        checkout_url?: string;
        session_id?: string;
        subscription?: { plan_id: string; needs_checkout: boolean };
        plan?: { id: string; name: string };
        invoice?: { id: string };
    }>("/org/checkout", {
        method: "POST",
        token,
        body: { plan_id: planId },
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

export { apiErrorMessage };
