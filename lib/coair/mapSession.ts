import type { AuthSession, SessionRole } from "@/lib/auth/resolveLogin";
import type { CoairOrgResponse, CoairUserPayload } from "./types";

export function mapApiRole(
    userRole: string,
    orgRole?: string | null
): SessionRole {
    if (userRole === "admin" || userRole === "superadmin") {
        return "super_admin";
    }
    if (orgRole === "owner") {
        return "company_admin";
    }
    return "member";
}

export function mapLiveSession(input: {
    user: CoairUserPayload;
    accessToken: string;
    org?: CoairOrgResponse | null;
    projectId?: string | null;
    impersonator?: string;
}): AuthSession {
    const orgRole = input.org?.role;
    const role = mapApiRole(input.user.role, orgRole);
    const companyId =
        input.org?.org?.org_id ??
        (role === "super_admin" ? null : `live:${input.user.username}`);

    return {
        email: input.user.username,
        name: input.user.display_name || input.user.username,
        role,
        companyId,
        companyName: input.org?.org?.name,
        userId: input.user.username,
        source: "live",
        accessToken: input.accessToken,
        projectId: input.projectId ?? null,
        username: input.user.username,
        needsCheckout: Boolean(input.org?.subscription?.needs_checkout),
        impersonator: input.impersonator,
    };
}
