export type SessionRole = "super_admin" | "company_admin" | "member";

export type AuthSession = {
    email: string;
    name: string;
    role: SessionRole;
    companyId: string | null;
    userId: string | null;
    source?: "mock" | "live";
    accessToken?: string;
    projectId?: string | null;
    username?: string;
    companyName?: string;
    needsCheckout?: boolean;
    impersonator?: string;
};

export const SUPER_ADMIN_EMAIL = "admin@coair.ai";
export const AUTH_SESSION_KEY = "coair.auth.session";
export const ADMIN_BACKUP_KEY = "coair.auth.adminBackup";

type LoginUser = {
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    companyId: string;
};

export function homePathForRole(role: SessionRole): string {
    if (role === "super_admin") return "/admin";
    if (role === "company_admin") return "/company";
    return "/workspace";
}

export function homePathForSession(
    session: AuthSession,
    company?: { needsCheckout?: boolean } | null
): string {
    if (session.source === "live") {
        if (session.role === "super_admin") return "/admin";
        if (session.needsCheckout || company?.needsCheckout) {
            return "/onboarding/plans";
        }
        return "/workspace";
    }
    if (session.role === "super_admin") return "/admin";
    if (company?.needsCheckout) return "/onboarding/plans";
    return homePathForRole(session.role);
}

export function resolveLogin(
    email: string,
    password: string,
    users: LoginUser[]
): { ok: true; session: AuthSession } | { ok: false; error: string } {
    if (!email.trim()) {
        return { ok: false, error: "Email required" };
    }
    if (!password.trim()) {
        return { ok: false, error: "Password required" };
    }

    const normalized = email.trim().toLowerCase();
    if (normalized === SUPER_ADMIN_EMAIL) {
        return {
            ok: true,
            session: {
                email: SUPER_ADMIN_EMAIL,
                name: "Super Admin",
                role: "super_admin",
                companyId: null,
                userId: null,
            },
        };
    }

    const user = users.find((entry) => entry.email.toLowerCase() === normalized);
    if (!user) {
        return { ok: false, error: "No account for that email" };
    }
    if (user.status === "suspended") {
        return { ok: false, error: "Account suspended" };
    }

    return {
        ok: true,
        session: {
            email: user.email,
            name: user.name,
            role: user.role === "admin" ? "company_admin" : "member",
            companyId: user.companyId,
            userId: user.id,
        },
    };
}
