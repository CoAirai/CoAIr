import { describe, expect, it } from "vitest";
import {
    ensureSelfInWorkspaceUsers,
    mapLiveOrgUsersToWorkspaceUsers,
} from "./mapWorkspaceUsers";

describe("mapLiveOrgUsersToWorkspaceUsers", () => {
    it("maps active org users for the workspace switcher", () => {
        const mapped = mapLiveOrgUsersToWorkspaceUsers(
            [
                {
                    username: "owner@acme.com",
                    display_name: "Ada Owner",
                    org_role: "owner",
                    is_active: true,
                },
                {
                    username: "ben@acme.com",
                    display_name: "Ben Member",
                    org_role: "member",
                    is_active: true,
                },
                {
                    username: "old@acme.com",
                    display_name: "Inactive",
                    org_role: "member",
                    is_active: false,
                },
            ],
            "org-1"
        );

        expect(mapped).toEqual([
            {
                id: "owner@acme.com",
                name: "Ada Owner",
                companyId: "org-1",
                status: "active",
                role: "admin",
            },
            {
                id: "ben@acme.com",
                name: "Ben Member",
                companyId: "org-1",
                status: "active",
                role: "member",
            },
            {
                id: "old@acme.com",
                name: "Inactive",
                companyId: "org-1",
                status: "suspended",
                role: "member",
            },
        ]);
    });
});

describe("ensureSelfInWorkspaceUsers", () => {
    it("prepends the signed-in admin when missing from the list", () => {
        const next = ensureSelfInWorkspaceUsers(
            [
                {
                    id: "ben@acme.com",
                    name: "Ben",
                    companyId: "org-1",
                    status: "active",
                    role: "member",
                },
            ],
            {
                userId: "owner@acme.com",
                name: "Ada",
                companyId: "org-1",
            }
        );
        expect(next[0]?.id).toBe("owner@acme.com");
        expect(next).toHaveLength(2);
    });
});
