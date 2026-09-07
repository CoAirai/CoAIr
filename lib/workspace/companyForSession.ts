import type { Company } from "@/lib/admin/types";
import type { ModuleId } from "@/lib/admin/types";
import type { AuthSession } from "@/lib/auth/resolveLogin";

function liveCompanyId(session: AuthSession): string | null {
    if (session.companyId) return session.companyId;
    if (session.source === "live") {
        return `live:${session.username || session.email}`;
    }
    return null;
}

export function addOnsFromModuleGrants(grants?: {
    chronology?: boolean;
    forensic?: boolean;
} | null): ModuleId[] {
    const addOns: ModuleId[] = [];
    if (grants?.chronology) addOns.push("chronology");
    if (grants?.forensic) addOns.push("forensic");
    return addOns;
}

export function liveCompanyFromSession(
    session: AuthSession,
    options?: { addOns?: ModuleId[] }
): Company | null {
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
        addOns: options?.addOns ?? [],
        trialUsage: {},
        needsCheckout: Boolean(session.needsCheckout),
    };
}

export function companyForSession(
    session: AuthSession | null | undefined,
    companies: Company[],
    options?: { addOns?: ModuleId[] }
): Company | null {
    if (!session) return null;
    if (session.companyId) {
        const found = companies.find((entry) => entry.id === session.companyId);
        if (found) {
            if (options?.addOns && session.source === "live") {
                return { ...found, addOns: options.addOns };
            }
            return found;
        }
        return liveCompanyFromSession(session, options);
    }
    return session.source === "live"
        ? liveCompanyFromSession(session, options)
        : null;
}
