import { describe, expect, it } from "vitest";
import { consumeUserTokens } from "./consumeUserTokens";

const acmeUser = {
    id: "u-002",
    companyId: "co-001",
    tokenSharePercent: 25,
    personalTokensUsed: 400,
    canUseOverflow: false,
    unusedReleased: false,
};

const acmeCompany = {
    id: "co-001",
    tokenLimit: 1878,
    tokensUsed: 1280,
};

describe("consumeUserTokens", () => {
    it("consumes from the personal slice", () => {
        const result = consumeUserTokens({
            user: { ...acmeUser, personalTokensUsed: 80 },
            company: acmeCompany,
            overflowTokens: 0,
            amount: 1,
        });

        expect(result).toEqual({
            ok: true,
            personalTokensUsed: 81,
            companyTokensUsed: 1281,
            overflowTokens: 0,
            usedOverflow: 0,
        });
    });

    it("blocks when the slice is empty and overflow is not allowed", () => {
        const result = consumeUserTokens({
            user: { ...acmeUser, personalTokensUsed: 469 },
            company: acmeCompany,
            overflowTokens: 50,
            amount: 1,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.toLowerCase()).toContain("token");
        }
    });

    it("uses overflow when allowed and the slice is empty", () => {
        const result = consumeUserTokens({
            user: {
                ...acmeUser,
                personalTokensUsed: 469,
                canUseOverflow: true,
            },
            company: acmeCompany,
            overflowTokens: 10,
            amount: 1,
        });

        expect(result).toEqual({
            ok: true,
            personalTokensUsed: 470,
            companyTokensUsed: 1281,
            overflowTokens: 9,
            usedOverflow: 1,
        });
    });

    it("uses company remaining when the user has no share", () => {
        const result = consumeUserTokens({
            user: {
                id: "u-005",
                companyId: "co-002",
                tokenSharePercent: 0,
                personalTokensUsed: 0,
                canUseOverflow: false,
                unusedReleased: false,
            },
            company: { id: "co-002", tokenLimit: 376, tokensUsed: 42 },
            overflowTokens: 0,
            amount: 1,
        });

        expect(result).toEqual({
            ok: true,
            personalTokensUsed: 1,
            companyTokensUsed: 43,
            overflowTokens: 0,
            usedOverflow: 0,
        });
    });
});
