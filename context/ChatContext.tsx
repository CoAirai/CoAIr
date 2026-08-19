"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { mapLiveCitations } from "@/lib/coair/mapCitations";
import { createConversation, sendLiveChat } from "@/lib/coair/liveLogin";
import { SEED_RECENTS_BY_USER, SEED_THREADS_BY_USER } from "@/lib/chat/demoData";
import { buildMockAnswer, buildMockReply } from "@/lib/chat/mockReply";
import {
    appendChatTurn,
    messagesForUser,
    recentsForUser,
    resolveActiveWorkspaceUserId,
} from "@/lib/chat/threads";
import type { Citation, Message, RecentQuery } from "@/lib/chat/types";

type ChatContextValue = {
    messages: Message[];
    recentQueries: RecentQuery[];
    isReplying: boolean;
    sendError: string | null;
    selectedQueryId: string | null;
    activeKbId: string;
    activeWorkspaceUserId: string | null;
    setActiveKbId: (id: string) => void;
    setActiveWorkspaceUserId: (id: string) => void;
    sendMessage: (text: string) => Promise<void>;
    selectQuery: (queryId: string) => void;
    clearChat: () => void;
    askAboutDocument: (name: string) => Promise<void>;
    openCitation: Citation | null;
    openDocumentPreview: (citation: Citation) => void;
    closeDocumentPreview: () => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

function makeId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatProvider({ children }: { children: ReactNode }) {
    const { session } = useAuth();
    const {
        users,
        companies,
        companyWorkspaces,
        consumeUserTokens,
    } = useAdminData();
    const [requestedWorkspaceUserId, setRequestedWorkspaceUserId] = useState<
        string | null
    >(null);
    const [threadsByUserId, setThreadsByUserId] = useState<
        Record<string, Message[]>
    >(() =>
        Object.fromEntries(
            Object.entries(SEED_THREADS_BY_USER).map(([id, messages]) => [
                id,
                messages.map((message) => ({ ...message })),
            ])
        )
    );
    const [recentsByUserId, setRecentsByUserId] = useState<
        Record<string, RecentQuery[]>
    >(() =>
        Object.fromEntries(
            Object.entries(SEED_RECENTS_BY_USER).map(([id, queries]) => [
                id,
                queries.map((query) => ({
                    ...query,
                    messages: query.messages?.map((message) => ({ ...message })),
                })),
            ])
        )
    );
    const [isReplying, setIsReplying] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [selectedQueryId, setSelectedQueryId] = useState<string | null>(null);
    const [activeKbId, setActiveKbId] = useState("assistant");
    const [openCitation, setOpenCitation] = useState<Citation | null>(null);
    const [liveConversationId, setLiveConversationId] = useState<string | null>(
        null
    );

    useEffect(() => {
        setLiveConversationId(null);
    }, [session?.userId, session?.projectId]);

    const activeWorkspaceUserId = useMemo(() => {
        if (!session?.userId || !session.companyId) return null;
        return resolveActiveWorkspaceUserId({
            role: session.role,
            userId: session.userId,
            requestedUserId: requestedWorkspaceUserId,
            users,
            companyId: session.companyId,
        });
    }, [requestedWorkspaceUserId, session, users]);

    const messages = activeWorkspaceUserId
        ? messagesForUser(threadsByUserId, activeWorkspaceUserId)
        : [];
    const recentQueries = activeWorkspaceUserId
        ? recentsForUser(recentsByUserId, activeWorkspaceUserId)
        : [];

    const companyDocs = useMemo(() => {
        if (!session?.companyId) return [];
        return companyWorkspaces[session.companyId]?.documents ?? [];
    }, [companyWorkspaces, session?.companyId]);

    const setActiveWorkspaceUserId = useCallback(
        (id: string) => {
            if (session?.role !== "company_admin") return;
            setRequestedWorkspaceUserId(id);
            setSelectedQueryId(null);
            setSendError(null);
            setOpenCitation(null);
        },
        [session?.role]
    );

    const clearChat = useCallback(() => {
        if (!activeWorkspaceUserId) return;
        setThreadsByUserId((prev) => ({
            ...prev,
            [activeWorkspaceUserId]: [],
        }));
        setSelectedQueryId(null);
        setOpenCitation(null);
    }, [activeWorkspaceUserId]);

    const selectQuery = useCallback(
        (queryId: string) => {
            if (!activeWorkspaceUserId) return;
            const query = recentsForUser(
                recentsByUserId,
                activeWorkspaceUserId
            ).find((entry) => entry.id === queryId);
            setSelectedQueryId(queryId);
            setActiveKbId("assistant");
            setThreadsByUserId((prev) => ({
                ...prev,
                [activeWorkspaceUserId]: query?.messages
                    ? query.messages.map((message) => ({ ...message }))
                    : [
                          {
                              id: makeId("u"),
                              role: "user",
                              content: `Open recent query ${queryId}`,
                              createdAt: new Date().toISOString(),
                              authorUserId: session?.userId ?? undefined,
                              authorName: session?.name,
                              threadUserId: activeWorkspaceUserId,
                          },
                          {
                              id: makeId("a"),
                              role: "assistant",
                              content: buildMockReply(
                                  `Open recent query ${queryId}`,
                                  companyDocs.map((doc) => doc.name)
                              ),
                              createdAt: new Date().toISOString(),
                              threadUserId: activeWorkspaceUserId,
                              citations: buildMockAnswer(
                                  `Open recent query ${queryId}`,
                                  companyDocs
                              ).citations,
                          },
                      ],
            }));
        },
        [
            activeWorkspaceUserId,
            companyDocs,
            recentsByUserId,
            session?.name,
            session?.userId,
        ]
    );

    const sendMessage = useCallback(
        async (text: string) => {
            const trimmed = text.trim();
            if (!trimmed || !session?.userId || !activeWorkspaceUserId) return;

            const live = session.source === "live" && Boolean(session.accessToken);

            if (!live) {
                const consumed = consumeUserTokens(activeWorkspaceUserId, 1);
                if (!consumed.ok) {
                    setSendError(consumed.error ?? "No tokens remaining");
                    return;
                }
            }

            setSendError(null);
            setSelectedQueryId(null);
            setIsReplying(true);

            try {
                let assistantText: string;
                let citations: Citation[] | undefined;

                if (live) {
                    if (!session.projectId) {
                        throw new Error(
                            "This account has no project yet. Seed the sandbox, then sign in again."
                        );
                    }
                    let conversationId = liveConversationId;
                    if (!conversationId) {
                        const created = await createConversation(
                            session.accessToken!,
                            session.projectId,
                            trimmed.slice(0, 80)
                        );
                        conversationId = created.conversation_id;
                        setLiveConversationId(conversationId);
                    }
                    const response = await sendLiveChat({
                        token: session.accessToken!,
                        projectId: session.projectId,
                        conversationId,
                        message: trimmed,
                        requestId: makeId("req"),
                    });
                    assistantText = response.assistant_text;
                    citations = mapLiveCitations(response.citations);
                } else {
                    await new Promise((resolve) => setTimeout(resolve, 600));
                    const company = companies.find(
                        (entry) => entry.id === session.companyId
                    );
                    const docs =
                        (company
                            ? companyWorkspaces[company.id]?.documents
                            : companyDocs) ?? [];
                    const answer = buildMockAnswer(trimmed, docs);
                    assistantText = answer.content;
                    citations = answer.citations;
                }

                setThreadsByUserId((prevThreads) => {
                    const next = appendChatTurn({
                        threadsByUserId: prevThreads,
                        recentsByUserId,
                        threadUserId: activeWorkspaceUserId,
                        authorUserId: session.userId!,
                        authorName: session.name,
                        userText: trimmed,
                        assistantText,
                        citations,
                        now: new Date().toISOString(),
                        userMessageId: makeId("u"),
                        assistantMessageId: makeId("a"),
                        queryId: makeId("q"),
                    });
                    setRecentsByUserId(next.recentsByUserId);
                    return next.threadsByUserId;
                });
            } catch (error) {
                setSendError(
                    error instanceof Error
                        ? error.message
                        : "Chat request failed"
                );
            } finally {
                setIsReplying(false);
            }
        },
        [
            activeWorkspaceUserId,
            companies,
            companyDocs,
            companyWorkspaces,
            consumeUserTokens,
            liveConversationId,
            recentsByUserId,
            session,
        ]
    );

    const askAboutDocument = useCallback(
        async (name: string) => {
            setActiveKbId("documents");
            await sendMessage(`What does ${name} say that the team should know?`);
        },
        [sendMessage]
    );

    const openDocumentPreview = useCallback((citation: Citation) => {
        setOpenCitation(citation);
    }, []);

    const closeDocumentPreview = useCallback(() => {
        setOpenCitation(null);
    }, []);

    const value = useMemo(
        () => ({
            messages,
            recentQueries,
            isReplying,
            sendError,
            selectedQueryId,
            activeKbId,
            activeWorkspaceUserId,
            setActiveKbId,
            setActiveWorkspaceUserId,
            sendMessage,
            selectQuery,
            clearChat,
            askAboutDocument,
            openCitation,
            openDocumentPreview,
            closeDocumentPreview,
        }),
        [
            activeKbId,
            activeWorkspaceUserId,
            askAboutDocument,
            clearChat,
            closeDocumentPreview,
            isReplying,
            messages,
            openCitation,
            openDocumentPreview,
            recentQueries,
            selectQuery,
            selectedQueryId,
            sendError,
            sendMessage,
            setActiveWorkspaceUserId,
        ]
    );

    return (
        <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
    );
}

export function useChat() {
    const ctx = useContext(ChatContext);
    if (!ctx) {
        throw new Error("useChat must be used within ChatProvider");
    }
    return ctx;
}
