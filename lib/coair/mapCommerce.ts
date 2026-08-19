import type { Plan, PlanId, TokenEconomics } from "@/lib/admin/types";
import type { AccessRequest } from "@/lib/admin/accessRequests";
import type { SupportTicket } from "@/lib/admin/wave2Types";

type CoairModuleRule = {
    access: "included" | "trial" | "addon";
    trial_reports?: number;
};

export type CoairPlanPayload = {
    id: PlanId;
    name: string;
    price_label: string;
    users_included: number;
    storage_limit_gb: number;
    api_credits_usd: number;
    query_cap: number;
    modules: {
        chatbot: CoairModuleRule;
        chronology: CoairModuleRule;
        forensic: CoairModuleRule;
    };
};

export type CoairTicketPayload = {
    id: string;
    company_id: string;
    subject: string;
    message?: string;
    priority: "low" | "medium" | "high";
    status: "open" | "resolved";
    assignee_id?: string | null;
    created_at: string;
};

export type CoairAccessRequestPayload = {
    id: string;
    full_name: string;
    email: string;
    company_name: string;
    status: "pending" | "approved" | "denied";
    created_at: string;
    resolved_at?: string | null;
    resolved_plan_id?: string | null;
};

export type CoairTokenEconomicsPayload = {
    provider_tokens_per_usd: number;
    sell_tokens_per_usd: number;
    updated_at: string;
    updated_by: string;
};

function mapModuleRule(rule: {
    access: "included" | "trial" | "addon";
    trial_reports?: number;
}) {
    return rule.access === "trial"
        ? { access: "trial" as const, trialReports: rule.trial_reports ?? 1 }
        : { access: rule.access };
}

export function mapPlan(payload: CoairPlanPayload): Plan {
    return {
        id: payload.id,
        name: payload.name,
        priceLabel: payload.price_label,
        usersIncluded: payload.users_included,
        storageLimitGb: payload.storage_limit_gb,
        apiCreditsUsd: payload.api_credits_usd,
        queryCap: payload.query_cap,
        modules: {
            chatbot: mapModuleRule(payload.modules.chatbot),
            chronology: mapModuleRule(payload.modules.chronology),
            forensic: mapModuleRule(payload.modules.forensic),
        },
    };
}

export function mapTicket(payload: CoairTicketPayload): SupportTicket {
    return {
        id: payload.id,
        companyId: payload.company_id,
        subject: payload.subject,
        status: payload.status,
        priority: payload.priority,
        assigneeId: payload.assignee_id ?? undefined,
        createdAt: payload.created_at,
        message: payload.message,
    };
}

export function mapAccessRequest(
    payload: CoairAccessRequestPayload
): AccessRequest {
    return {
        id: payload.id,
        fullName: payload.full_name,
        email: payload.email,
        companyName: payload.company_name,
        createdAt: payload.created_at,
        status: payload.status,
        resolvedAt: payload.resolved_at ?? undefined,
        resolvedPlanId: (payload.resolved_plan_id as AccessRequest["resolvedPlanId"]) ?? undefined,
    };
}

export function mapTokenEconomics(
    payload: CoairTokenEconomicsPayload
): TokenEconomics {
    return {
        providerTokensPerUsd: payload.provider_tokens_per_usd,
        sellTokensPerUsd: payload.sell_tokens_per_usd,
        updatedAt: payload.updated_at,
        updatedBy: payload.updated_by,
    };
}

export function planToPayload(plan: Plan): Record<string, unknown> {
    return {
        name: plan.name,
        price_label: plan.priceLabel,
        users_included: plan.usersIncluded,
        storage_limit_gb: plan.storageLimitGb,
        api_credits_usd: plan.apiCreditsUsd,
        query_cap: plan.queryCap,
        modules: {
            chatbot: {
                access: plan.modules.chatbot.access,
                trial_reports: plan.modules.chatbot.trialReports,
            },
            chronology: {
                access: plan.modules.chronology.access,
                trial_reports: plan.modules.chronology.trialReports,
            },
            forensic: {
                access: plan.modules.forensic.access,
                trial_reports: plan.modules.forensic.trialReports,
            },
        },
    };
}
