import {
    userAllocation,
    userRemainingInSlice,
} from "@/lib/company/tokenMath";

export type TokenMeter = {
    used: number;
    allocation: number;
    remaining: number;
    remainingPercent: number;
};

export function getTokenMeter(input: {
    tokenLimit: number;
    tokensUsed: number;
    tokenSharePercent?: number;
    personalTokensUsed?: number;
    unusedReleased?: boolean;
}): TokenMeter {
    const used = input.personalTokensUsed ?? 0;
    const share = input.tokenSharePercent ?? 0;
    const allocation =
        share > 0
            ? userAllocation(input.tokenLimit, share)
            : Math.max(0, input.tokenLimit - input.tokensUsed + used);
    const remaining =
        share > 0
            ? userRemainingInSlice(allocation, used, input.unusedReleased ?? false)
            : Math.max(0, input.tokenLimit - input.tokensUsed);
    const remainingPercent =
        allocation <= 0
            ? 0
            : Math.round((Math.min(remaining, allocation) / allocation) * 100);

    return { used, allocation, remaining, remainingPercent };
}

export function formatTokenCount(value: number): string {
    if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(1)}M`;
    }
    if (value >= 10_000) {
        return `${(value / 1_000).toFixed(1)}K`;
    }
    return new Intl.NumberFormat("en-US").format(value);
}
