"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Icon from "@/components/Icon";
import TokenUsage from "./TokenUsage";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import { useLiveWorkspace } from "@/context/LiveWorkspaceContext";
import type { CompanyDocument } from "@/lib/admin/companyDocuments";
import { chatTransition } from "@/lib/chat/motion";
import { getTokenMeter } from "@/lib/chat/tokenMeter";

const PAGE_SIZE = 10;

function isIndexed(status?: string) {
    const value = (status || "completed").toLowerCase();
    return value === "completed" || value === "ready";
}

type FileState = "indexed" | "indexing" | "failed";
type StatusFilter = "all" | FileState;

function fileState(status?: string): FileState {
    const value = (status || "").toLowerCase();
    if (value === "error" || value === "failed") return "failed";
    if (isIndexed(status)) return "indexed";
    return "indexing";
}

function shortError(raw?: string) {
    const lines = (raw || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    const text = (lines[lines.length - 1] || "").replaceAll("_", " ");
    if (!text) return "";
    return text.length > 90 ? `${text.slice(0, 87)}…` : text;
}

function attentionRank(status?: string) {
    const state = fileState(status);
    if (state === "failed") return 0;
    if (state === "indexing") return 1;
    return 2;
}

function DocumentActions({
    onAsk,
    onRemove,
    onReinject,
    onPin,
    pinLabel,
    onDownload,
}: {
    onAsk?: () => void;
    onRemove?: () => void;
    onReinject?: () => void;
    onPin?: () => void;
    pinLabel?: string;
    onDownload?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return;
        const close = (event: Event) => {
            if (event.target instanceof Node && rootRef.current?.contains(event.target)) {
                return;
            }
            setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("pointerdown", close);
        document.addEventListener("keydown", onKey);
        window.addEventListener("scroll", close, true);
        return () => {
            document.removeEventListener("pointerdown", close);
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("scroll", close, true);
        };
    }, [open]);

    return (
        <div ref={rootRef} className="relative shrink-0">
            <button
                ref={buttonRef}
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-weak-50"
                aria-label="Document actions"
                aria-expanded={open}
                onClick={() => {
                    const rect = buttonRef.current?.getBoundingClientRect();
                    if (rect) {
                        setPosition({
                            top: rect.bottom + 4,
                            left: Math.max(8, rect.right - 160),
                        });
                    }
                    setOpen((value) => !value);
                }}
            >
                <Icon className="fill-strong-950" name="dots" />
            </button>
            {open && (
                <div
                    className="fixed z-50 w-40 rounded-xl border border-stroke-soft-200 bg-white-0 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
                    style={{ top: position.top, left: position.left }}
                >
                    {onAsk && (
                        <button
                            type="button"
                            className="flex h-9 w-full items-center rounded-lg px-3 text-left text-label-xs text-strong-950 hover:bg-weak-50"
                            onClick={() => {
                                setOpen(false);
                                onAsk();
                            }}
                        >
                            Ask
                        </button>
                    )}
                    {onPin && (
                        <button
                            type="button"
                            className="flex h-9 w-full items-center rounded-lg px-3 text-left text-label-xs text-strong-950 hover:bg-weak-50"
                            onClick={() => {
                                setOpen(false);
                                onPin();
                            }}
                        >
                            {pinLabel || "Pin"}
                        </button>
                    )}
                    {onDownload && (
                        <button
                            type="button"
                            className="flex h-9 w-full items-center rounded-lg px-3 text-left text-label-xs text-strong-950 hover:bg-weak-50"
                            onClick={() => {
                                setOpen(false);
                                onDownload();
                            }}
                        >
                            Download
                        </button>
                    )}
                    {onReinject && (
                        <button
                            type="button"
                            className="flex h-9 w-full items-center rounded-lg px-3 text-left text-label-xs text-strong-950 hover:bg-weak-50"
                            onClick={() => {
                                setOpen(false);
                                onReinject();
                            }}
                        >
                            Index again
                        </button>
                    )}
                    {onRemove && (
                        <button
                            type="button"
                            className="flex h-9 w-full items-center rounded-lg px-3 text-left text-label-xs text-red-500 hover:bg-weak-50"
                            onClick={() => {
                                setOpen(false);
                                onRemove();
                            }}
                        >
                            Remove
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

type GroupProps = {
    title: string;
    icon: string;
    items: CompanyDocument[];
    canManage: boolean;
    defaultOpen?: boolean;
    loading?: boolean;
    onAsk: (name: string) => void;
    onRemove: (id: string) => void;
    onRetryFailed?: (ids: string[]) => void;
    onReinject?: (id: string) => void;
    onPin?: (id: string, pinned: boolean) => void;
    onDownload?: (id: string, name: string) => void;
};

const DocumentGroup = ({
    title,
    icon,
    items,
    canManage,
    defaultOpen = false,
    loading = false,
    onAsk,
    onRemove,
    onRetryFailed,
    onReinject,
    onPin,
    onDownload,
}: GroupProps) => {
    const [open, setOpen] = useState(defaultOpen);
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const searchRef = useRef<HTMLInputElement>(null);
    const counts = useMemo(() => {
        const next = { indexed: 0, indexing: 0, failed: 0 };
        for (const doc of items) next[fileState(doc.status)] += 1;
        return next;
    }, [items]);
    const needle = query.trim().toLowerCase();
    const filtering = needle.length > 0 || statusFilter !== "all";
    const ordered = useMemo(() => {
        return items
            .filter((doc) => {
                if (statusFilter !== "all" && fileState(doc.status) !== statusFilter) {
                    return false;
                }
                if (needle && !doc.name.toLowerCase().includes(needle)) return false;
                return true;
            })
            .sort((a, b) => {
                const rank = attentionRank(a.status) - attentionRank(b.status);
                if (rank !== 0) return rank;
                return Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
            });
    }, [items, needle, statusFilter]);
    const visible = ordered.slice(0, visibleCount);
    const hiddenCount = Math.max(0, ordered.length - visible.length);

    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
    }, [needle, statusFilter]);

    useEffect(() => {
        if (searchOpen) searchRef.current?.focus();
    }, [searchOpen]);

    return (
        <div className="mt-2">
            <div className="flex items-center">
                <button
                    type="button"
                    className="flex h-10 min-w-0 grow items-center gap-2 rounded-xl px-3 text-left text-label-sm text-strong-950 hover:bg-weak-50"
                    onClick={() => setOpen((value) => !value)}
                    aria-expanded={open}
                >
                    <Icon className="shrink-0 fill-strong-950" name={icon} />
                    <span className="grow truncate">
                        {title}
                        <span className="ml-1 text-label-xs text-soft-400 tabular-nums">
                            ({filtering ? ordered.length : items.length})
                        </span>
                    </span>
                    <Icon
                        className={`shrink-0 fill-soft-400 transition-transform duration-300 ${
                            open ? "rotate-180" : ""
                        }`}
                        name="chevron"
                    />
                </button>
                <button
                    type="button"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-weak-50"
                    aria-label={`Search ${title}`}
                    aria-expanded={searchOpen}
                    onClick={() => {
                        setOpen(true);
                        setSearchOpen((value) => !value);
                    }}
                >
                    <Icon
                        className={filtering ? "fill-blue-500" : "fill-strong-950"}
                        name="search"
                    />
                </button>
            </div>
            <motion.div
                initial={false}
                animate={{
                    height: open ? "auto" : 0,
                    opacity: open ? 1 : 0,
                }}
                transition={chatTransition}
                className="overflow-hidden"
            >
                <div className="mt-1 flex flex-col gap-0.5">
                    {searchOpen && (
                        <div className="px-2 pb-1">
                            <input
                                ref={searchRef}
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Find a file"
                                aria-label={`Find a file in ${title}`}
                                className="h-8 w-full rounded-lg border border-stroke-soft-200 bg-white-0 px-2.5 text-label-xs text-strong-950 outline-none placeholder:text-soft-400"
                            />
                            <div className="mt-1.5 flex flex-wrap gap-1">
                                {(
                                    [
                                        ["indexed", "Indexed"],
                                        ["indexing", "Indexing"],
                                        ["failed", "Failed"],
                                    ] as const
                                ).map(([key, label]) => {
                                    const active = statusFilter === key;
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            className={`h-6 rounded-full border px-2 text-label-xs tabular-nums ${
                                                active
                                                    ? key === "failed"
                                                        ? "border-red-500 text-red-500"
                                                        : key === "indexed"
                                                          ? "border-green-600 text-green-600"
                                                          : "border-strong-950 text-strong-950"
                                                    : "border-stroke-soft-200 text-soft-400 hover:text-strong-950"
                                            }`}
                                            onClick={() =>
                                                setStatusFilter((current) =>
                                                    current === key ? "all" : key
                                                )
                                            }
                                        >
                                            {label} {counts[key]}
                                        </button>
                                    );
                                })}
                            </div>
                            {statusFilter === "failed" &&
                            counts.failed > 0 &&
                            onRetryFailed ? (
                                <button
                                    type="button"
                                    className="mt-1.5 h-7 rounded-lg px-2 text-label-xs text-blue-500 hover:bg-weak-50"
                                    onClick={() =>
                                        onRetryFailed(ordered.map((doc) => doc.id))
                                    }
                                >
                                    Retry failed
                                </button>
                            ) : null}
                        </div>
                    )}
                    {items.length === 0 && (
                        <div className="px-3 py-2 text-label-xs text-soft-400">
                            {loading ? "Loading…" : "No files yet"}
                        </div>
                    )}
                    {items.length > 0 && ordered.length === 0 && (
                        <div className="px-3 py-2 text-label-xs text-soft-400">
                            No matching files
                        </div>
                    )}
                    <AnimatePresence initial={false}>
                        {visible.map((doc) => (
                            <motion.div
                                key={doc.id}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={chatTransition}
                                className="flex items-center gap-1 rounded-xl px-1"
                            >
                                <div className="flex min-h-10 min-w-0 grow items-center gap-2 rounded-xl px-2 py-1 text-left text-label-sm">
                                    <Icon
                                        className="shrink-0 fill-strong-950"
                                        name={icon}
                                    />
                                    <span className="min-w-0 grow">
                                        <span className="block truncate">
                                            {doc.name}
                                        </span>
                                        {fileState(doc.status) === "failed" &&
                                        shortError(doc.error) ? (
                                            <span className="block truncate text-label-xs text-red-500">
                                                {shortError(doc.error)}
                                            </span>
                                        ) : null}
                                    </span>
                                    {doc.pinned ? (
                                        <span className="shrink-0 text-label-xs text-blue-500">
                                            pinned
                                        </span>
                                    ) : null}
                                    {isIndexed(doc.status) ? (
                                        <span
                                            className="flex h-5 w-5 shrink-0 items-center justify-center"
                                            title="Indexed"
                                            aria-label="Indexed"
                                        >
                                            <Icon
                                                className="fill-green-600"
                                                name="check"
                                            />
                                        </span>
                                    ) : fileState(doc.status) === "failed" ? (
                                        <span className="shrink-0 text-label-xs text-red-500">
                                            failed
                                        </span>
                                    ) : null}
                                </div>
                                <DocumentActions
                                    onAsk={() => onAsk(doc.name)}
                                    onRemove={
                                        canManage
                                            ? () => onRemove(doc.id)
                                            : undefined
                                    }
                                    onReinject={
                                        onReinject
                                            ? () => onReinject(doc.id)
                                            : undefined
                                    }
                                    onPin={
                                        onPin
                                            ? () => onPin(doc.id, !doc.pinned)
                                            : undefined
                                    }
                                    pinLabel={doc.pinned ? "Unpin" : "Pin"}
                                    onDownload={
                                        onDownload
                                            ? () => onDownload(doc.id, doc.name)
                                            : undefined
                                    }
                                />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    {hiddenCount > 0 && (
                        <button
                            type="button"
                            className="mx-1 h-9 rounded-xl px-3 text-left text-label-xs text-blue-500 transition-colors hover:bg-weak-50"
                            onClick={() =>
                                setVisibleCount((count) => count + PAGE_SIZE)
                            }
                        >
                            View more · {hiddenCount} left
                        </button>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

const KnowledgeBase = () => {
    const { session } = useAuth();
    const { companies, users, companyWorkspaces, removeCompanyDocument } =
        useAdminData();
    const live = useLiveWorkspace();
    const {
        activeKbId,
        setActiveKbId,
        clearChat,
        askAboutDocument,
        activeWorkspaceUserId,
    } = useChat();
    const documents = live.enabled
        ? live.documents
        : (session?.companyId
              ? companyWorkspaces[session.companyId]?.documents
              : []) ?? [];
    const files = documents.filter((doc) => doc.kind === "document");
    const communications = documents.filter(
        (doc) => doc.kind === "communication"
    );
    const sheets = documents.filter(
        (doc) => doc.kind === "spreadsheet" || doc.kind === "csv"
    );
    const libraryCounts = documents.reduce(
        (counts, doc) => {
            counts[fileState(doc.status)] += 1;
            return counts;
        },
        { indexed: 0, indexing: 0, failed: 0 }
    );
    const canRemove = session?.role === "company_admin";
    const canManage = live.enabled || canRemove;
    const docsLoading = live.enabled && live.libraryLoading;
    const transfers = live.enabled ? live.fileTransfers : [];

    const tokenMeter = useMemo(() => {
        if (live.enabled) {
            const selected = live.orgUsers.find(
                (entry) => entry.username === activeWorkspaceUserId
            );
            if (selected) {
                const used = selected.used_tokens ?? 0;
                const limit = selected.token_limit ?? 0;
                return getTokenMeter({
                    tokenLimit: limit,
                    tokensUsed: used,
                    personalTokensUsed: used,
                });
            }
            if (live.accountUsage) {
                const used = live.accountUsage.used_tokens ?? 0;
                const limit = live.accountUsage.token_limit ?? 0;
                return getTokenMeter({
                    tokenLimit: limit,
                    tokensUsed: used,
                    personalTokensUsed: used,
                });
            }
            return null;
        }
        const company = companies.find((entry) => entry.id === session?.companyId);
        const user = users.find((entry) => entry.id === activeWorkspaceUserId);
        if (!company || !user) return null;
        return getTokenMeter({
            tokenLimit: company.tokenLimit,
            tokensUsed: company.tokensUsed,
            tokenSharePercent: user.tokenSharePercent,
            personalTokensUsed: user.personalTokensUsed,
            unusedReleased: user.unusedReleased,
        });
    }, [
        activeWorkspaceUserId,
        companies,
        live.accountUsage,
        live.enabled,
        live.orgUsers,
        session?.companyId,
        users,
    ]);

    const removeDoc = (documentId: string) => {
        const name =
            documents.find((doc) => doc.id === documentId)?.name || "this file";
        if (!window.confirm(`Remove ${name} from this project?`)) return;
        if (live.enabled) {
            void live.removeFile(documentId);
            return;
        }
        if (!session?.companyId) return;
        removeCompanyDocument({
            companyId: session.companyId,
            documentId,
            actorRole: session.role,
        });
    };

    return (
        <div className="mb-6">
            <div className="mb-2 px-3 text-label-xs text-soft-400">
                Knowledge Base
            </div>
            {live.enabled && live.interruptedUpload ? (
                <div className="mb-3 rounded-xl border border-stroke-soft-200 bg-white-0 px-3 py-2">
                    <p className="text-label-xs leading-5 text-strong-950">
                        The last send stopped.{" "}
                        {live.interruptedUpload.sent.toLocaleString()} of{" "}
                        {live.interruptedUpload.total.toLocaleString()} reached
                        Amazon. Choose the same files again. Ones already there
                        are skipped.
                    </p>
                    <button
                        type="button"
                        className="mt-1.5 text-label-xs text-blue-500"
                        onClick={() => live.dismissInterruptedUpload()}
                    >
                        Dismiss
                    </button>
                </div>
            ) : null}
            {transfers.length > 0 && (
                <div className="mb-3 flex flex-col gap-2 px-1">
                    {transfers.map((transfer) => (
                        <div
                            key={transfer.id}
                            className="rounded-xl border border-stroke-soft-200 bg-white-0 px-3 py-2"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 truncate text-label-xs text-strong-950">
                                    {transfer.name}
                                </div>
                                <div
                                    className={`max-w-[58%] shrink truncate text-right text-label-xs ${
                                        transfer.phase === "failed"
                                            ? "text-red-500"
                                            : transfer.phase === "ready"
                                              ? "text-green-600"
                                              : "text-soft-400"
                                    }`}
                                >
                                    {transfer.phase === "uploading"
                                        ? `Uploading ${transfer.percent}%`
                                        : transfer.phase === "injecting"
                                          ? `${transfer.stage || "Injecting"} ${transfer.percent}%`
                                          : transfer.phase === "ready"
                                            ? "Ready"
                                            : "Failed"}
                                </div>
                            </div>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-weak-50">
                                <div
                                    className={`h-full rounded-full transition-[width] duration-300 ${
                                        transfer.phase === "failed"
                                            ? "bg-red-400"
                                            : transfer.phase === "ready"
                                              ? "bg-green-500"
                                              : "bg-blue-500"
                                    }`}
                                    style={{
                                        width: `${Math.min(100, Math.max(3, transfer.percent))}%`,
                                    }}
                                />
                            </div>
                            {transfer.id === "server-index" ? (
                                <div className="mt-1 text-label-xs text-sub-600">
                                    You can close this page. Indexing continues on the server.
                                </div>
                            ) : null}
                            {transfer.error && (
                                <div className="mt-1 text-label-xs text-red-500">
                                    {transfer.error}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
            <div className="flex flex-col gap-1">
                <button
                    type="button"
                    className={`flex min-h-11 items-center gap-2 rounded-xl px-3 py-1 text-left text-label-sm transition-colors ${
                        activeKbId === "assistant"
                            ? "bg-weak-50 dark:shadow-[0_0_0.1875rem_0_rgba(255,255,255,0.16)]"
                            : "hover:text-blue-500"
                    }`}
                    onClick={() => {
                        setActiveKbId("assistant");
                        clearChat();
                    }}
                >
                    <Icon className="shrink-0 fill-strong-950" name="chat" />
                    <span className="truncate">AI Assistant</span>
                    {tokenMeter && (
                        <TokenUsage
                            used={tokenMeter.used}
                            allocation={tokenMeter.allocation}
                            remainingPercent={tokenMeter.remainingPercent}
                            showGemini={false}
                        />
                    )}
                </button>
                {documents.length > 0 ? (
                    <p className="px-3 py-1 text-label-xs text-soft-400 tabular-nums">
                        {libraryCounts.failed.toLocaleString()} failed ·{" "}
                        {libraryCounts.indexing.toLocaleString()} indexing ·{" "}
                        {libraryCounts.indexed.toLocaleString()} indexed
                    </p>
                ) : null}

                <DocumentGroup
                    title="Documents"
                    icon="document"
                    items={files}
                    canManage={canManage}
                    defaultOpen
                    loading={docsLoading}
                    onAsk={(name) => void askAboutDocument(name)}
                    onRemove={removeDoc}
                    onRetryFailed={
                        live.enabled
                            ? (ids) => void live.reinjectFiles(ids)
                            : undefined
                    }
                    onReinject={
                        live.enabled
                            ? (id) => void live.reinjectFile(id)
                            : undefined
                    }
                    onPin={
                        live.enabled
                            ? (id, pinned) => void live.pinFile(id, pinned)
                            : undefined
                    }
                    onDownload={
                        live.enabled
                            ? (id, name) => void live.downloadFile(id, name)
                            : undefined
                    }
                />
                <DocumentGroup
                    title="Communications"
                    icon="comment"
                    items={communications}
                    canManage={canManage}
                    loading={docsLoading}
                    onAsk={(name) => void askAboutDocument(name)}
                    onRemove={removeDoc}
                    onRetryFailed={
                        live.enabled
                            ? (ids) => void live.reinjectFiles(ids)
                            : undefined
                    }
                    onReinject={
                        live.enabled
                            ? (id) => void live.reinjectFile(id)
                            : undefined
                    }
                    onPin={
                        live.enabled
                            ? (id, pinned) => void live.pinFile(id, pinned)
                            : undefined
                    }
                    onDownload={
                        live.enabled
                            ? (id, name) => void live.downloadFile(id, name)
                            : undefined
                    }
                />
                <DocumentGroup
                    title="Spreadsheets"
                    icon="analytic"
                    items={sheets}
                    canManage={canManage}
                    loading={docsLoading}
                    onAsk={(name) => void askAboutDocument(name)}
                    onRemove={removeDoc}
                    onRetryFailed={
                        live.enabled
                            ? (ids) => void live.reinjectFiles(ids)
                            : undefined
                    }
                    onReinject={
                        live.enabled
                            ? (id) => void live.reinjectFile(id)
                            : undefined
                    }
                    onPin={
                        live.enabled
                            ? (id, pinned) => void live.pinFile(id, pinned)
                            : undefined
                    }
                    onDownload={
                        live.enabled
                            ? (id, name) => void live.downloadFile(id, name)
                            : undefined
                    }
                />
            </div>
        </div>
    );
};

export default KnowledgeBase;
