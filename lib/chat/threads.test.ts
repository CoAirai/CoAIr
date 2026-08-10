import { describe, expect, it } from "vitest";
import {
    activeWorkspaceUsers,
    appendChatTurn,
    messagesForUser,
    resolveActiveWorkspaceUserId,
} from "./threads";

const users = [
    {
        id: "u-001",
        name: "Ada Lovelace",
        companyId: "co-001",
        status: "active" as const,
        role: "admin" as const,
    },
    {
        id: "u-002",
        name: "Ben Carter",
        companyId: "co-001",
        status: "active" as const,
        role: "member" as const,
    },
    {
        id: "u-004",
        name: "David Kim",
        companyId: "co-001",
        status: "pending" as const,
        role: "viewer" as const,
    },
];

describe("activeWorkspaceUsers", () => {
    it("lists only active users in the company", () => {
        expect(activeWorkspaceUsers(users, "co-001").map((user) => user.id)).toEqual([
            "u-001",
            "u-002",
        ]);
    });
});

describe("resolveActiveWorkspaceUserId", () => {
    it("locks members to themselves", () => {
        expect(
            resolveActiveWorkspaceUserId({
                role: "member",
                userId: "u-002",
                requestedUserId: "u-001",
                users,
                companyId: "co-001",
            })
        ).toBe("u-002");
    });

    it("lets company admin switch to an active teammate", () => {
        expect(
            resolveActiveWorkspaceUserId({
                role: "company_admin",
                userId: "u-001",
                requestedUserId: "u-002",
                users,
                companyId: "co-001",
            })
        ).toBe("u-002");
    });
});

describe("appendChatTurn", () => {
    it("puts an admin-authored message on the selected user thread", () => {
        const next = appendChatTurn({
            threadsByUserId: { "u-002": [] },
            recentsByUserId: { "u-002": [] },
            threadUserId: "u-002",
            authorUserId: "u-001",
            authorName: "Ada Lovelace",
            userText: "Check Ben's drawings",
            assistantText: "Mock reply citing Safety.pdf",
            now: "2026-08-05T11:00:00.000Z",
            userMessageId: "m-u",
            assistantMessageId: "m-a",
            queryId: "q-new",
        });

        const thread = messagesForUser(next.threadsByUserId, "u-002");
        expect(thread).toHaveLength(2);
        expect(thread[0]).toMatchObject({
            id: "m-u",
            authorUserId: "u-001",
            threadUserId: "u-002",
            content: "Check Ben's drawings",
        });
        expect(messagesForUser(next.threadsByUserId, "u-001")).toHaveLength(0);
        expect(next.recentsByUserId["u-002"]?.[0]?.title).toBe("Check Ben's drawings");
    });
});
