import {
    userAllocation,
    userRemainingInSlice,
} from "@/lib/company/tokenMath";

export type ConsumeTokenUser = {
    id: string;
    companyId: string;
    tokenSharePercent?: number;
    personalTokensUsed?: number;
    canUseOverflow?: boolean;
    unusedReleased?: boolean;
};

export type ConsumeTokenCompany = {
    id: string;
    tokenLimit: number;
    tokensUsed: number;
};

export type ConsumeTokensInput = {
    user: ConsumeTokenUser;
    company: ConsumeTokenCompany;
    overflowTokens: number;
    amount: number;
};

export type ConsumeTokensResult =
    | {
          ok: true;
          personalTokensUsed: number;
          companyTokensUsed: number;
          overflowTokens: number;
          usedOverflow: number;
      }
    | { ok: false; error: string };

export function consumeUserTokens(
    input: ConsumeTokensInput
): ConsumeTokensResult {
    const amount = input.amount;
    if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, error: "Token amount must be positive" };
    }

    const used = input.user.personalTokensUsed ?? 0;
    const share = input.user.tokenSharePercent ?? 0;
    const companyRemaining = Math.max(
        0,
        input.company.tokenLimit - input.company.tokensUsed
    );

    if (share <= 0) {
        if (companyRemaining < amount) {
            return { ok: false, error: "No tokens remaining" };
        }
        return {
            ok: true,
            personalTokensUsed: used + amount,
            companyTokensUsed: input.company.tokensUsed + amount,
            overflowTokens: input.overflowTokens,
            usedOverflow: 0,
        };
    }

    const allocation = userAllocation(input.company.tokenLimit, share);
    const sliceRemaining = userRemainingInSlice(
        allocation,
        used,
        input.user.unusedReleased ?? false
    );

    if (sliceRemaining >= amount) {
        return {
            ok: true,
            personalTokensUsed: used + amount,
            companyTokensUsed: input.company.tokensUsed + amount,
            overflowTokens: input.overflowTokens,
            usedOverflow: 0,
        };
    }

    const fromSlice = Math.max(0, sliceRemaining);
    const fromOverflow = amount - fromSlice;
    if (
        input.user.canUseOverflow &&
        input.overflowTokens >= fromOverflow &&
        fromOverflow > 0
    ) {
        return {
            ok: true,
            personalTokensUsed: used + amount,
            companyTokensUsed: input.company.tokensUsed + amount,
            overflowTokens: input.overflowTokens - fromOverflow,
            usedOverflow: fromOverflow,
        };
    }

    return { ok: false, error: "No tokens remaining" };
}
