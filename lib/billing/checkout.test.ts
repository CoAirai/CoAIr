import { describe, expect, it } from "vitest";
import { applyCheckout, validateDummyPayment } from "./checkout";
import type { Company } from "../admin/types";
import { PLANS } from "../admin/plans";

const company: Company = {
    id: "co-new",
    name: "Hale Civil",
    industry: "General",
    planId: "demo",
    status: "trial",
    usersCount: 1,
    storageLimitGb: 20,
    storageUsedGb: 0,
    tokenLimit: 376,
    tokensUsed: 0,
    createdAt: "2026-08-05",
    addOns: [],
    trialUsage: {},
    needsCheckout: true,
};

describe("applyCheckout", () => {
    it("assigns the selected plan and clears checkout", () => {
        const pro = PLANS.find((plan) => plan.id === "pro")!;
        const next = applyCheckout(company, pro);
        expect(next.planId).toBe("pro");
        expect(next.needsCheckout).toBe(false);
        expect(next.status).toBe("active");
        expect(next.storageLimitGb).toBe(pro.storageLimitGb);
        expect(next.tokenLimit).toBe(pro.queryCap);
    });
});

describe("validateDummyPayment", () => {
    it("accepts a complete dummy card", () => {
        expect(
            validateDummyPayment({
                name: "Jordan Hale",
                cardNumber: "4242 4242 4242 4242",
                expiry: "12/28",
                cvc: "123",
            })
        ).toEqual({ ok: true });
    });

    it("rejects missing dummy card fields", () => {
        expect(
            validateDummyPayment({
                name: " ",
                cardNumber: "4242",
                expiry: "",
                cvc: "",
            }).ok
        ).toBe(false);
    });
});
