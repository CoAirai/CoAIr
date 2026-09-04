import type { CoairOrgUser } from "./org";
import type { WorkspaceUser } from "@/lib/chat/threads";

/** Map live `/org/users` rows into the workspace switcher shape. */
export function mapLiveOrgUsersToWorkspaceUsers(
    users: CoairOrgUser[],
    companyId: string
): WorkspaceUser[] {
    return users.map((user) => ({
        id: user.username,
        name: (user.display_name || user.username).trim() || user.username,
        companyId,
        status: user.is_active === false ? "suspended" : "active",
        role: user.org_role === "owner" ? "admin" : "member",
    }));
}

/** Ensure the signed-in admin is always selectable even if the list is stale. */
export function ensureSelfInWorkspaceUsers(
    users: WorkspaceUser[],
    self: { userId: string; name: string; companyId: string } | null
): WorkspaceUser[] {
    if (!self?.userId || !self.companyId) return users;
    if (users.some((user) => user.id === self.userId)) return users;
    return [
        {
            id: self.userId,
            name: self.name || self.userId,
            companyId: self.companyId,
            status: "active",
            role: "admin",
        },
        ...users,
    ];
}
