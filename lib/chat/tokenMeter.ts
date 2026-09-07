import {
    formatCa,
    microsToCa,
} from "@/lib/billing/tokenEconomics";
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

/** Compact CA credit label from CA micros (1 CA = 1e6 micros). */
export function formatCaCount(micros: number): string {
    const ca = microsToCa(micros);
    if (ca >= 1_000) {
        return `${(ca / 1_000).toFixed(ca >= 10_000 ? 0 : 1)}K`;
    }
    if (ca >= 100) {
        return ca.toFixed(0);
    }
    if (ca >= 10) {
        return ca.toFixed(1);
    }
    return formatCa(micros);
}

/** Legacy Gemini-scale display of the same micros balance (1 CA ≈ 1M Gemini units). */
export function formatGeminiFromCaMicros(micros: number): string {
    if (micros >= 1_000_000) {
        return `${(micros / 1_000_000).toFixed(1)}M`;
    }
    if (micros >= 10_000) {
        return `${(micros / 1_000).toFixed(1)}K`;
    }
    return new Intl.NumberFormat("en-US").format(Math.round(micros));
}

/** @deprecated use formatCaCount — kept for older call sites */
export function formatTokenCount(value: number): string {
    return formatGeminiFromCaMicros(value);
}
