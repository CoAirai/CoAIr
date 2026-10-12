"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useLiveWorkspace } from "@/context/LiveWorkspaceContext";
import { mapLiveCitations } from "@/lib/coair/mapCitations";
import {
    archiveConversation,
    createConversation,
    deleteConversation,
    getConversation,
    listConversations,
    pinConversation,
    renameConversation,
    sendLiveChat,
} from "@/lib/coair/liveLogin";
import { SEED_RECENTS_BY_USER, SEED_THREADS_BY_USER } from "@/lib/chat/demoData";
import { buildMockAnswer, buildMockReply } from "@/lib/chat/mockReply";
import {
    messagesForUser,
    recentsForUser,
    resolveActiveWorkspaceUserId,
    type WorkspaceUser,
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
    sendMessage: (text: string) => Promise<boolean>;
    stopReply: () => void;
    selectQuery: (queryId: string) => void;
    archivedQueries: RecentQuery[];
    pinQuery: (queryId: string, pinned: boolean) => Promise<void>;
    renameQuery: (queryId: string, title: string) => Promise<void>;
    deleteQuery: (queryId: string) => Promise<void>;
    archiveQuery: (queryId: string, archived: boolean) => Promise<void>;
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

function orderQueries(items: RecentQuery[], limit?: number): RecentQuery[] {
    const pinned = items.filter((row) => row.pinned);
    const rest = items.filter((row) => !row.pinned);
    const visible = limit == null ? rest : rest.slice(0, limit);
    const seen = new Set(pinned.map((row) => row.id));
    return [...pinned, ...visible.filter((row) => !seen.has(row.id))];
}

function toRecentQueries(
    rows: Array<{ conversation_id: string; title?: string; pinned?: boolean }> | undefined,
    limit?: number
): RecentQuery[] {
    return orderQueries(
        (rows ?? []).map((row) => ({
            id: row.conversation_id,
            title: row.title || "Conversation",
            pinned: Boolean(row.pinned),
        })),
        limit
    );
}

export function ChatProvider({ children }: { children: ReactNode }) {
    const { session } = useAuth();
    const {
        users: mockUsers,
        companies,
        companyWorkspaces,
        consumeUserTokens,
    } = useAdminData();
    const live = useLiveWorkspace();
    const { pushToast } = useToast();
    const workspaceUsers = useMemo((): WorkspaceUser[] => {
        if (live.enabled && session?.role === "company_admin") {
            if (live.teammates.length > 0) return live.teammates;
            if (session.userId && session.companyId) {
                return [
                    {
                        id: session.userId,
                        name: session.name || session.userId,
                        companyId: session.companyId,
                        status: "active",
                        role: "admin",
                    },
                ];
            }
            return [];
        }
        return mockUsers;
    }, [
        live.enabled,
        live.teammates,
        mockUsers,
        session?.companyId,
        session?.name,
        session?.role,
        session?.userId,
    ]);
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
    const chatAbortRef = useRef<AbortController | null>(null);
    const chatStoppedRef = useRef(false);
    const [selectedQueryId, setSelectedQueryId] = useState<string | null>(null);
    const [activeKbId, setActiveKbId] = useState("assistant");
    const [openCitation, setOpenCitation] = useState<Citation | null>(null);
    const liveConversationIdRef = useRef<string | null>(null);
    const rememberConversation = useCallback((id: string | null) => {
        liveConversationIdRef.current = id;
    }, []);
    const [archivedByUserId, setArchivedByUserId] = useState<
        Record<string, RecentQuery[]>
    >({});

    useEffect(() => {
        rememberConversation(null);
    }, [
        rememberConversation,
        session?.userId,
        session?.projectId,
        requestedWorkspaceUserId,
    ]);

    const reloadQueries = useCallback(async () => {
        if (
            session?.source !== "live" ||
            !session.accessToken ||
            !session.projectId ||
            !session.userId
        ) {
            return;
        }
        const token = session.accessToken;
        const projectId = session.projectId;
        const userId = session.userId;
        const [active, archived] = await Promise.all([
            listConversations(token, projectId),
            listConversations(token, projectId, true).catch(() => []),
        ]);
        setRecentsByUserId((prev) => ({
            ...prev,
            [userId]: toRecentQueries(
                (active ?? []).filter((row) => !row.archived),
                20
            ),
        }));
        setArchivedByUserId((prev) => ({
            ...prev,
            [userId]: toRecentQueries(archived ?? []),
        }));
    }, [
        session?.accessToken,
        session?.projectId,
        session?.source,
        session?.userId,
    ]);

    // Hydrate Recent Queries from the live conversations API (survives refresh).
    useEffect(() => {
        void reloadQueries().catch(() => {
            /* keep whatever is already in memory */
        });
    }, [reloadQueries]);

    const activeWorkspaceUserId = useMemo(() => {
        if (!session?.userId || !session.companyId) return null;
        return resolveActiveWorkspaceUserId({
            role: session.role,
            userId: session.userId,
            requestedUserId: requestedWorkspaceUserId,
            users: workspaceUsers,
            companyId: session.companyId,
        });
    }, [requestedWorkspaceUserId, session, workspaceUsers]);

    const messages = activeWorkspaceUserId
        ? messagesForUser(threadsByUserId, activeWorkspaceUserId)
        : [];
    const recentQueries = activeWorkspaceUserId
        ? recentsForUser(recentsByUserId, activeWorkspaceUserId)
        : [];
    const archivedQueries = activeWorkspaceUserId
        ? archivedByUserId[activeWorkspaceUserId] ?? []
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

    const liveSession = useCallback(() => {
        if (
            session?.source !== "live" ||
            !session.accessToken ||
            !session.projectId ||
            !session.userId
        ) {
            return null;
        }
        return {
            token: session.accessToken,
            projectId: session.projectId,
            userId: session.userId,
        };
    }, [session?.accessToken, session?.projectId, session?.source, session?.userId]);

    const pinQuery = useCallback(
        async (queryId: string, pinned: boolean) => {
            if (!activeWorkspaceUserId) return;
            setRecentsByUserId((prev) => {
                const current = prev[activeWorkspaceUserId] ?? [];
                return {
                    ...prev,
                    [activeWorkspaceUserId]: orderQueries(
                        current.map((entry) =>
                            entry.id === queryId ? { ...entry, pinned } : entry
                        )
                    ),
                };
            });
            const auth = liveSession();
            if (!auth) {
                pushToast(pinned ? "Query pinned" : "Query unpinned", "info");
                return;
            }
            try {
                await pinConversation(auth.token, auth.projectId, queryId, pinned);
                pushToast(pinned ? "Query pinned" : "Query unpinned", "info");
                void reloadQueries();
            } catch (err) {
                pushToast(
                    err instanceof Error ? err.message : "Could not pin query",
                    "error"
                );
                void reloadQueries();
            }
        },
        [activeWorkspaceUserId, liveSession, pushToast, reloadQueries]
    );

    const renameQuery = useCallback(
        async (queryId: string, title: string) => {
            const nextTitle = title.trim();
            if (!nextTitle || !activeWorkspaceUserId) return;
            const apply = (rows: RecentQuery[]) =>
                rows.map((entry) =>
                    entry.id === queryId ? { ...entry, title: nextTitle } : entry
                );
            setRecentsByUserId((prev) => ({
                ...prev,
                [activeWorkspaceUserId]: apply(prev[activeWorkspaceUserId] ?? []),
            }));
            setArchivedByUserId((prev) => ({
                ...prev,
                [activeWorkspaceUserId]: apply(prev[activeWorkspaceUserId] ?? []),
            }));
            const auth = liveSession();
            if (!auth) {
                pushToast("Query renamed", "info");
                return;
            }
            try {
                await renameConversation(
                    auth.token,
                    auth.projectId,
                    queryId,
                    nextTitle
                );
                pushToast("Query renamed", "info");
            } catch (err) {
                pushToast(
                    err instanceof Error ? err.message : "Could not rename query",
                    "error"
                );
                void reloadQueries();
            }
        },
        [activeWorkspaceUserId, liveSession, pushToast, reloadQueries]
    );

    const forgetOpenQuery = useCallback(
        (queryId: string) => {
            if (selectedQueryId !== queryId) return;
            if (activeWorkspaceUserId) {
                setThreadsByUserId((prev) => ({
                    ...prev,
                    [activeWorkspaceUserId]: [],
                }));
            }
            setSelectedQueryId(null);
            rememberConversation(null);
            setOpenCitation(null);
        },
        [activeWorkspaceUserId, rememberConversation, selectedQueryId]
    );

    const deleteQuery = useCallback(
        async (queryId: string) => {
            if (!activeWorkspaceUserId) return;
            setRecentsByUserId((prev) => ({
                ...prev,
                [activeWorkspaceUserId]: (prev[activeWorkspaceUserId] ?? []).filter(
                    (entry) => entry.id !== queryId
                ),
            }));
            setArchivedByUserId((prev) => ({
                ...prev,
                [activeWorkspaceUserId]: (prev[activeWorkspaceUserId] ?? []).filter(
                    (entry) => entry.id !== queryId
                ),
            }));
            forgetOpenQuery(queryId);
            const auth = liveSession();
            if (!auth) {
                pushToast("Query deleted", "info");
                return;
            }
            try {
                await deleteConversation(auth.token, auth.projectId, queryId);
                pushToast("Query deleted", "info");
            } catch (err) {
                pushToast(
                    err instanceof Error ? err.message : "Could not delete query",
                    "error"
                );
                void reloadQueries();
            }
        },
        [activeWorkspaceUserId, forgetOpenQuery, liveSession, pushToast, reloadQueries]
    );

    const archiveQuery = useCallback(
        async (queryId: string, archived: boolean) => {
            if (!activeWorkspaceUserId) return;
            const from = archived ? recentsByUserId : archivedByUserId;
            const source = from[activeWorkspaceUserId] ?? [];
            const moving = source.find((entry) => entry.id === queryId);
            if (!moving && archived) {
                const fallback = (recentsByUserId[activeWorkspaceUserId] ?? []).find(
                    (entry) => entry.id === queryId
                );
                if (!fallback) return;
            }
            const item =
                moving ??
                (recentsByUserId[activeWorkspaceUserId] ?? []).find(
                    (entry) => entry.id === queryId
                );
            if (!item) return;
            const stored = archived ? { ...item, pinned: false } : item;
            if (archived) {
                setRecentsByUserId((prev) => ({
                    ...prev,
                    [activeWorkspaceUserId]: (prev[activeWorkspaceUserId] ?? []).filter(
                        (entry) => entry.id !== queryId
                    ),
                }));
                setArchivedByUserId((prev) => ({
                    ...prev,
                    [activeWorkspaceUserId]: [
                        stored,
                        ...(prev[activeWorkspaceUserId] ?? []).filter(
                            (entry) => entry.id !== queryId
                        ),
                    ],
                }));
                forgetOpenQuery(queryId);
            } else {
                setArchivedByUserId((prev) => ({
                    ...prev,
                    [activeWorkspaceUserId]: (prev[activeWorkspaceUserId] ?? []).filter(
                        (entry) => entry.id !== queryId
                    ),
                }));
                setRecentsByUserId((prev) => ({
                    ...prev,
                    [activeWorkspaceUserId]: orderQueries([
                        stored,
                        ...(prev[activeWorkspaceUserId] ?? []).filter(
                            (entry) => entry.id !== queryId
                        ),
                    ]),
                }));
            }
            const auth = liveSession();
            if (!auth) {
                pushToast(archived ? "Query archived" : "Query restored", "info");
                return;
            }
            try {
                await archiveConversation(
                    auth.token,
                    auth.projectId,
                    queryId,
                    archived
                );
                pushToast(archived ? "Query archived" : "Query restored", "info");
                void reloadQueries();
            } catch (err) {
                pushToast(
                    err instanceof Error ? err.message : "Could not archive query",
                    "error"
                );
                void reloadQueries();
            }
        },
        [
            activeWorkspaceUserId,
            archivedByUserId,
            forgetOpenQuery,
            liveSession,
            pushToast,
            recentsByUserId,
            reloadQueries,
        ]
    );

    const clearChat = useCallback(() => {
        if (!activeWorkspaceUserId) return;
        setThreadsByUserId((prev) => ({
            ...prev,
            [activeWorkspaceUserId]: [],
        }));
        setSelectedQueryId(null);
        setOpenCitation(null);
        rememberConversation(null);
    }, [activeWorkspaceUserId, rememberConversation]);

    const selectQuery = useCallback(
        (queryId: string) => {
            if (!activeWorkspaceUserId) return;
            const query = recentsForUser(
                recentsByUserId,
                activeWorkspaceUserId
            ).find((entry) => entry.id === queryId);
            setSelectedQueryId(queryId);
            setActiveKbId("assistant");
            setSendError(null);
            setOpenCitation(null);

            const live =
                session?.source === "live" &&
                Boolean(session.accessToken) &&
                Boolean(session.projectId);

            if (live) {
                rememberConversation(queryId);
                if (query?.messages?.length) {
                    setThreadsByUserId((prev) => ({
                        ...prev,
                        [activeWorkspaceUserId]: query.messages!.map((m) => ({
                            ...m,
                        })),
                    }));
                    return;
                }
                void getConversation(
                    session!.accessToken!,
                    session!.projectId!,
                    queryId
                )
                    .then((conv) => {
                        const mapped: Message[] = (conv.messages ?? []).map(
                            (m, index) => ({
                                id: `${queryId}-${index}`,
                                role:
                                    m.role === "assistant"
                                        ? ("assistant" as const)
                                        : ("user" as const),
                                content:
                                    m.role === "assistant"
                                        ? m.response?.answer || m.content
                                        : m.content,
                                createdAt:
                                    m.timestamp || new Date().toISOString(),
                                threadUserId: activeWorkspaceUserId,
                                citations:
                                    m.role === "assistant"
                                        ? mapLiveCitations(
                                              m.response?.citations
                                          )
                                        : undefined,
                                authorUserId:
                                    m.role === "user"
                                        ? session?.userId ?? undefined
                                        : undefined,
                                authorName:
                                    m.role === "user"
                                        ? session?.name
                                        : undefined,
                            })
                        );
                        setThreadsByUserId((prev) => ({
                            ...prev,
                            [activeWorkspaceUserId]: mapped,
                        }));
                        setRecentsByUserId((prev) => ({
                            ...prev,
                            [activeWorkspaceUserId]: (
                                prev[activeWorkspaceUserId] ?? []
                            ).map((entry) =>
                                entry.id === queryId
                                    ? {
                                          ...entry,
                                          title: conv.title || entry.title,
                                          messages: mapped.slice(-2),
                                      }
                                    : entry
                            ),
                        }));
                    })
                    .catch((err) => {
                        setSendError(
                            err instanceof Error
                                ? err.message
                                : "Unable to open conversation"
                        );
                    });
                return;
            }

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
            session?.accessToken,
            session?.name,
            session?.projectId,
            rememberConversation,
            session?.source,
            session?.userId,
        ]
    );

    const stopReply = useCallback(() => {
        chatStoppedRef.current = true;
        chatAbortRef.current?.abort();
        setIsReplying(false);
    }, []);

    const sendMessage = useCallback(
        async (text: string) => {
            const trimmed = text.trim();
            if (!trimmed || !session?.userId || !activeWorkspaceUserId) return false;

            const isLiveChat = session.source === "live" && Boolean(session.accessToken);

            if (!isLiveChat) {
                const consumed = consumeUserTokens(activeWorkspaceUserId, 1);
                if (!consumed.ok) {
                    setSendError(consumed.error ?? "No tokens remaining");
                    return false;
                }
            }

            setSendError(null);
            setSelectedQueryId(null);
            setIsReplying(true);
            chatStoppedRef.current = false;
            const abort = new AbortController();
            chatAbortRef.current = abort;

            const userMessageId = makeId("u");
            const assistantMessageId = makeId("a");
            const now = new Date().toISOString();
            let conversationIdForRecent: string | null =
                liveConversationIdRef.current;

            // Show the user message immediately; assistant fills in when the API returns.
            setThreadsByUserId((prev) => ({
                ...prev,
                [activeWorkspaceUserId]: [
                    ...(prev[activeWorkspaceUserId] ?? []),
                    {
                        id: userMessageId,
                        role: "user",
                        content: trimmed,
                        createdAt: now,
                        authorUserId: session.userId!,
                        authorName: session.name,
                        threadUserId: activeWorkspaceUserId,
                    },
                ],
            }));

            try {
                let assistantText: string;
                let citations: Citation[] | undefined;

                if (isLiveChat) {
                    if (!session.projectId) {
                        throw new Error(
                            "This account has no project yet. Seed the sandbox, then sign in again."
                        );
                    }
                    let conversationId = liveConversationIdRef.current;
                    if (!conversationId) {
                        const created = await createConversation(
                            session.accessToken!,
                            session.projectId,
                            trimmed.slice(0, 80)
                        );
                        conversationId = created.conversation_id;
                        rememberConversation(conversationId);
                    }
                    conversationIdForRecent = conversationId;
                    const response = await sendLiveChat({
                        token: session.accessToken!,
                        projectId: session.projectId,
                        conversationId,
                        message: trimmed,
                        requestId: makeId("req"),
                        signal: abort.signal,
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

                const queryId = conversationIdForRecent || makeId("q");
                const libraryDocs = live.enabled ? live.documents : [];
                const indexed = libraryDocs.filter((doc) => {
                    const value = (doc.status || "completed").toLowerCase();
                    return value === "completed" || value === "ready";
                }).length;
                const stillIndexing = libraryDocs.length - indexed;
                const assistantMessage: Message = {
                    id: assistantMessageId,
                    role: "assistant",
                    content: assistantText,
                    createdAt: new Date().toISOString(),
                    threadUserId: activeWorkspaceUserId,
                    citations,
                    libraryNote:
                        stillIndexing > 0
                            ? `Answered from ${indexed.toLocaleString()} indexed files. ${stillIndexing.toLocaleString()} were still indexing.`
                            : undefined,
                };
                const userMessage: Message = {
                    id: userMessageId,
                    role: "user",
                    content: trimmed,
                    createdAt: now,
                    authorUserId: session.userId!,
                    authorName: session.name,
                    threadUserId: activeWorkspaceUserId,
                };

                setThreadsByUserId((prevThreads) => {
                    const thread = prevThreads[activeWorkspaceUserId] ?? [];
                    const withoutDup = thread.some((m) => m.id === userMessageId)
                        ? thread
                        : [...thread, userMessage];
                    return {
                        ...prevThreads,
                        [activeWorkspaceUserId]: [
                            ...withoutDup,
                            assistantMessage,
                        ],
                    };
                });
                setRecentsByUserId((prevRecents) => {
                    const existing = prevRecents[activeWorkspaceUserId] ?? [];
                    const previous = existing.find((entry) => entry.id === queryId);
                    const nextEntry: RecentQuery = {
                        id: queryId,
                        title: previous?.title || trimmed,
                        pinned: previous?.pinned,
                        messages: [userMessage, assistantMessage],
                    };
                    return {
                        ...prevRecents,
                        [activeWorkspaceUserId]: orderQueries(
                            [
                                nextEntry,
                                ...existing.filter((entry) => entry.id !== queryId),
                            ],
                            20
                        ),
                    };
                });
                setSelectedQueryId(queryId);
                return true;
            } catch (error) {
                const stopped =
                    chatStoppedRef.current ||
                    (error instanceof Error && error.message === "stopped");
                setThreadsByUserId((prev) => ({
                    ...prev,
                    [activeWorkspaceUserId]: (
                        prev[activeWorkspaceUserId] ?? []
                    ).filter((entry) => entry.id !== userMessageId),
                }));
                if (!stopped) {
                    setSendError(
                        error instanceof Error
                            ? error.message
                            : "Chat request failed"
                    );
                }
                return false;
            } finally {
                if (chatAbortRef.current === abort) chatAbortRef.current = null;
                setIsReplying(false);
            }
        },
        [
            activeWorkspaceUserId,
            companies,
            companyDocs,
            companyWorkspaces,
            consumeUserTokens,
            live.documents,
            live.enabled,
            rememberConversation,
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
            archivedQueries,
            isReplying,
            sendError,
            selectedQueryId,
            activeKbId,
            activeWorkspaceUserId,
            setActiveKbId,
            setActiveWorkspaceUserId,
            sendMessage,
            stopReply,
            selectQuery,
            pinQuery,
            renameQuery,
            deleteQuery,
            archiveQuery,
            clearChat,
            askAboutDocument,
            openCitation,
            openDocumentPreview,
            closeDocumentPreview,
        }),
        [
            activeKbId,
            activeWorkspaceUserId,
            archiveQuery,
            archivedQueries,
            askAboutDocument,
            clearChat,
            deleteQuery,
            closeDocumentPreview,
            isReplying,
            messages,
            openCitation,
            openDocumentPreview,
            pinQuery,
            recentQueries,
            renameQuery,
            selectQuery,
            selectedQueryId,
            sendError,
            sendMessage,
            stopReply,
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
