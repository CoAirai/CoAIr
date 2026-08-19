import type { AuthSession } from "./resolveLogin";
import { homePathForSession } from "./resolveLogin";
import { homeUrlForSession } from "./hosts";

export function postLoginPath(
    session: AuthSession,
    companies: { id: string; needsCheckout?: boolean }[]
) {
    const company = companies.find((entry) => entry.id === session.companyId);
    return homePathForSession(session, company);
}

export function postLoginUrl(
    session: AuthSession,
    companies: { id: string; needsCheckout?: boolean }[]
) {
    const company = companies.find((entry) => entry.id === session.companyId);
    return homeUrlForSession(session, company);
}
