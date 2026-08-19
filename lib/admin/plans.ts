import type { ModuleId, ModuleRule, Plan, PlanId } from "./types";

const CHATBOT_INCLUDED: ModuleRule = { access: "included" };
const ADDON: ModuleRule = { access: "addon" };
const TRIAL_ONE: ModuleRule = { access: "trial", trialReports: 1 };

const PAID_MODULES: Record<ModuleId, ModuleRule> = {
    chatbot: CHATBOT_INCLUDED,
    chronology: ADDON,
    forensic: ADDON,
};

export const PLAN_ORDER: PlanId[] = [
    "demo",
    "foundation",
    "pro",
    "enterprise",
    "custom",
];

export const PLANS: Plan[] = [
    {
        id: "demo",
        name: "Demo",
        priceLabel: "Trial",
        usersIncluded: 3,
        storageLimitGb: 20,
        apiCreditsUsd: 20,
        queryCap: 376,
        modules: {
            chatbot: CHATBOT_INCLUDED,
            chronology: TRIAL_ONE,
            forensic: TRIAL_ONE,
        },
    },
    {
        id: "foundation",
        name: "Foundation",
        priceLabel: "Foundation",
        usersIncluded: 5,
        storageLimitGb: 20,
        apiCreditsUsd: 50,
        queryCap: 939,
        modules: { ...PAID_MODULES },
    },
    {
        id: "pro",
        name: "Pro",
        priceLabel: "Pro",
        usersIncluded: 10,
        storageLimitGb: 80,
        apiCreditsUsd: 100,
        queryCap: 1878,
        modules: { ...PAID_MODULES },
    },
    {
        id: "enterprise",
        name: "Enterprise",
        priceLabel: "Enterprise",
        usersIncluded: 15,
        storageLimitGb: 150,
        apiCreditsUsd: 200,
        queryCap: 3756,
        modules: { ...PAID_MODULES },
    },
    {
        id: "custom",
        name: "Custom",
        priceLabel: "Custom",
        usersIncluded: 25,
        storageLimitGb: 300,
        apiCreditsUsd: 400,
        queryCap: 7512,
        modules: { ...PAID_MODULES },
    },
];

export function getPlanById(id: string, plans: Plan[] = PLANS) {
    return plans.find((plan) => plan.id === id) ?? null;
}

export function planForCompany(
    company: { planId: string } | null | undefined,
    plans: Plan[] = PLANS
) {
    if (!company) return null;
    return getPlanById(company.planId, plans) ?? getPlanById("pro", plans);
}

export function clonePlans(plans: Plan[] = PLANS): Plan[] {
    return plans.map((plan) => ({
        ...plan,
        modules: {
            chatbot: { ...plan.modules.chatbot },
            chronology: { ...plan.modules.chronology },
            forensic: { ...plan.modules.forensic },
        },
    }));
}
