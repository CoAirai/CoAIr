import type { Company, Plan } from "../admin/types";

export type DummyPaymentInput = {
    name: string;
    cardNumber: string;
    expiry: string;
    cvc: string;
};

export function applyCheckout(company: Company, plan: Plan): Company {
    return {
        ...company,
        planId: plan.id,
        storageLimitGb: plan.storageLimitGb,
        tokenLimit: plan.queryCap,
        status: "active",
        needsCheckout: false,
    };
}

export function validateDummyPayment(
    input: DummyPaymentInput
): { ok: true } | { ok: false; error: string } {
    if (!input.name.trim()) {
        return { ok: false, error: "Cardholder name required" };
    }
    const digits = input.cardNumber.replace(/\s+/g, "");
    if (digits.length < 12) {
        return { ok: false, error: "Enter a dummy card number" };
    }
    if (!input.expiry.trim()) {
        return { ok: false, error: "Expiry required" };
    }
    if (!input.cvc.trim()) {
        return { ok: false, error: "CVC required" };
    }
    return { ok: true };
}
