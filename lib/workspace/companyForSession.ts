import type { Company } from "@/lib/admin/types";
import type { AuthSession } from "@/lib/auth/resolveLogin";

function liveCompanyId(session: AuthSession): string | null {
    if (session.companyId) return session.companyId;
    if (session.source === "live") {
        return `live:${session.username || session.email}`;
    }
    return null;
}

export function liveCompanyFromSession(session: AuthSession): Company | null {
    const id = liveCompanyId(session);
    if (!id) return null;
    if (session.source !== "live" && !session.companyId) {
        return null;
    }

    return {
        id,
        name: session.companyName || session.name,
        industry: "Construction",
        planId: "pro",
        status: "active",
        usersCount: 1,
        storageLimitGb: 80,
        storageUsedGb: 0,
        tokenLimit: 1878,
        tokensUsed: 0,
        createdAt: new Date().toISOString().slice(0, 10),
        addOns: ["chronology", "forensic"],
        trialUsage: {},
        needsCheckout: Boolean(session.needsCheckout),
    };
}

export function companyForSession(
    session: AuthSession | null | undefined,
    companies: Company[]
): Company | null {
    if (!session) return null;
    if (session.companyId) {
        return (
            companies.find((entry) => entry.id === session.companyId) ??
            liveCompanyFromSession(session)
        );
    }
    return session.source === "live" ? liveCompanyFromSession(session) : null;
}
