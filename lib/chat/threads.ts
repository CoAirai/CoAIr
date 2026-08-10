import type { Message, RecentQuery } from "./types";

export type WorkspaceUser = {
    id: string;
    name: string;
    companyId: string;
    status: string;
    role: string;
};

export function activeWorkspaceUsers<T extends WorkspaceUser>(
    users: T[],
    companyId: string
): T[] {
    return users.filter(
        (user) => user.companyId === companyId && user.status === "active"
    );
}

export function resolveActiveWorkspaceUserId(input: {
    role: string;
    userId: string;
    requestedUserId: string | null | undefined;
    users: WorkspaceUser[];
    companyId: string;
}): string {
    if (input.role !== "company_admin") {
        return input.userId;
    }

    const allowed = activeWorkspaceUsers(input.users, input.companyId);
    if (
        input.requestedUserId &&
        allowed.some((user) => user.id === input.requestedUserId)
    ) {
        return input.requestedUserId;
    }

    return input.userId;
}

export function messagesForUser(
    threadsByUserId: Record<string, Message[]>,
    userId: string
): Message[] {
    return threadsByUserId[userId] ?? [];
}

export function recentsForUser(
    recentsByUserId: Record<string, RecentQuery[]>,
    userId: string
): RecentQuery[] {
    return recentsByUserId[userId] ?? [];
}

export function appendChatTurn(input: {
    threadsByUserId: Record<string, Message[]>;
    recentsByUserId: Record<string, RecentQuery[]>;
    threadUserId: string;
    authorUserId: string;
    authorName: string;
    userText: string;
    assistantText: string;
    citations?: Message["citations"];
    now: string;
    userMessageId: string;
    assistantMessageId: string;
    queryId: string;
}): {
    threadsByUserId: Record<string, Message[]>;
    recentsByUserId: Record<string, RecentQuery[]>;
} {
    const userMessage: Message = {
        id: input.userMessageId,
        role: "user",
        content: input.userText,
        createdAt: input.now,
        authorUserId: input.authorUserId,
        authorName: input.authorName,
        threadUserId: input.threadUserId,
    };
    const assistantMessage: Message = {
        id: input.assistantMessageId,
        role: "assistant",
        content: input.assistantText,
        createdAt: input.now,
        threadUserId: input.threadUserId,
        citations: input.citations,
    };

    const previous = messagesForUser(input.threadsByUserId, input.threadUserId);
    const nextThread = [...previous, userMessage, assistantMessage];
    const previousRecents = recentsForUser(
        input.recentsByUserId,
        input.threadUserId
    );

    return {
        threadsByUserId: {
            ...input.threadsByUserId,
            [input.threadUserId]: nextThread,
        },
        recentsByUserId: {
            ...input.recentsByUserId,
            [input.threadUserId]: [
                {
                    id: input.queryId,
                    title: input.userText,
                    messages: nextThread.slice(-2),
                },
                ...previousRecents,
            ].slice(0, 8),
        },
    };
}
