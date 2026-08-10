import type { AuthSession } from "./resolveLogin";
import { homePathForSession } from "./resolveLogin";

export function postLoginPath(
    session: AuthSession,
    companies: { id: string; needsCheckout?: boolean }[]
) {
    const company = companies.find((entry) => entry.id === session.companyId);
    return homePathForSession(session, company);
}
