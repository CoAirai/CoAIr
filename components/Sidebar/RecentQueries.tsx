"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import type { ChronologyReport } from "@/lib/chronology/types";
import { mapChronologyJob } from "@/lib/coair/mapChronology";
import { listReports } from "@/lib/coair/reports";
import { ownedByUser } from "@/lib/workspace/ownedByUser";

const PAGE_SIZE = 5;

function QueryActions({
    pinned,
    archived,
    onPin,
    onRename,
    onArchive,
    onDelete,
}: {
    pinned?: boolean;
    archived?: boolean;
    onPin: () => void;
    onRename: () => void;
    onArchive: () => void;
    onDelete: () => void;
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

    const itemClass =
        "flex h-9 w-full items-center rounded-lg px-3 text-left text-label-xs text-strong-950 hover:bg-weak-50";

    return (
        <div ref={rootRef} className="relative shrink-0">
            <button
                ref={buttonRef}
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-weak-50"
                aria-label="Query actions"
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
                    {!archived && (
                        <button
                            type="button"
                            className={itemClass}
                            onClick={() => {
                                setOpen(false);
                                onPin();
                            }}
                        >
                            {pinned ? "Unpin" : "Pin"}
                        </button>
                    )}
                    <button
                        type="button"
                        className={itemClass}
                        onClick={() => {
                            setOpen(false);
                            onRename();
                        }}
                    >
                        Rename
                    </button>
                    <button
                        type="button"
                        className={itemClass}
                        onClick={() => {
                            setOpen(false);
                            onArchive();
                        }}
                    >
                        {archived ? "Unarchive" : "Archive"}
                    </button>
                    <button
                        type="button"
                        className="flex h-9 w-full items-center rounded-lg px-3 text-left text-label-xs text-red-500 hover:bg-weak-50"
                        onClick={() => {
                            setOpen(false);
                            onDelete();
                        }}
                    >
                        Delete
                    </button>
                </div>
            )}
        </div>
    );
}

const RecentQueries = () => {
    const pathname = usePathname();
    const router = useRouter();
    const isChronology = pathname.startsWith("/workspace/chronology");
    const {
        selectedQueryId,
        selectQuery,
        recentQueries,
        archivedQueries,
        pinQuery,
        renameQuery,
        deleteQuery,
        archiveQuery,
        activeWorkspaceUserId,
    } = useChat();
    const [viewingArchive, setViewingArchive] = useState(false);
    const [querySearch, setQuerySearch] = useState("");
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameDraft, setRenameDraft] = useState("");
    const renameSaved = useRef(false);
    const { session } = useAuth();
    const { companyWorkspaces } = useAdminData();
    const live = session?.source === "live" && Boolean(session.accessToken);
    const [liveReports, setLiveReports] = useState<ChronologyReport[]>([]);
    const workspace = session?.companyId
        ? companyWorkspaces[session.companyId]
        : undefined;
    const chronologyReports = ownedByUser(
        workspace?.chronologyReports ?? [],
        activeWorkspaceUserId ?? session?.userId
    );

    useEffect(() => {
        if (!isChronology || !live || !session?.accessToken || !session.projectId) {
            setLiveReports([]);
            return;
        }
        let cancelled = false;
        const token = session.accessToken;
        const projectId = session.projectId;
        const companyId = session.companyId ?? "live";
        const load = () => {
            void listReports(token, projectId, "chronology")
                .then((payload) => {
                    if (cancelled) return;
                    setLiveReports(
                        (payload.reports ?? []).map((job) =>
                            mapChronologyJob(job, companyId)
                        )
                    );
                })
                .catch(() => {
                    /* keep the last list if a refresh fails */
                });
        };
        load();
        const timer = window.setInterval(load, 8000);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [
        isChronology,
        live,
        session?.accessToken,
        session?.companyId,
        session?.projectId,
    ]);
    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
    }, [querySearch, viewingArchive]);

    const activeChronologyId = pathname.startsWith("/workspace/chronology/")
        ? pathname.split("/workspace/chronology/")[1]
        : null;

    if (isChronology) {
        const reports = (live ? liveReports : chronologyReports).filter((report) => {
            const needle = querySearch.trim().toLowerCase();
            if (!needle) return true;
            return `${report.reference} ${report.title}`.toLowerCase().includes(needle);
        });
        const activeId = activeChronologyId;
        const hrefBase = "/workspace/chronology";

        return (
            <div className="mb-4">
                <div className="mb-2 flex items-center justify-between px-3">
                    <div className="text-label-xs text-soft-400">
                        Recent Queries
                    </div>
                    <span className="text-label-xs text-soft-400">
                        {reports.length} total
                    </span>
                </div>
                <div className="px-3 pb-2">
                    <input
                        value={querySearch}
                        onChange={(event) => setQuerySearch(event.target.value)}
                        placeholder="Search reports"
                        aria-label="Search chronology reports"
                        className="h-9 w-full rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-label-xs text-strong-950 outline-none placeholder:text-soft-400 focus:border-blue-500"
                    />
                </div>
                <div className="flex flex-col gap-0.5">
                    {reports.length === 0 && (
                        <div className="px-3 py-2 text-label-xs text-soft-400">
                            {querySearch.trim()
                                ? "No matching reports"
                                : "No chronology reports yet"}
                        </div>
                    )}
                    {reports.map((report) => {
                        const active = activeId === report.id;
                        return (
                            <button
                                key={report.id}
                                type="button"
                                className={`h-10 px-3 rounded-xl text-left text-label-sm truncate transition-colors ${
                                    active
                                        ? "bg-weak-50 dark:shadow-[0_0_0.1875rem_0_rgba(255,255,255,0.16)]"
                                        : "hover:bg-weak-50/70"
                                } ${
                                    report.status !== "ready"
                                        ? "text-sub-600"
                                        : ""
                                }`}
                                onClick={() => {
                                    router.push(`${hrefBase}/${report.id}`);
                                }}
                            >
                                {report.reference}.x · {report.title}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    const queries = (viewingArchive ? archivedQueries : recentQueries).filter(
        (entry) => {
            const needle = querySearch.trim().toLowerCase();
            if (!needle) return true;
            return entry.title.toLowerCase().includes(needle);
        }
    );
    const visibleQueries = queries.slice(0, visibleCount);
    const hiddenCount = queries.length - visibleQueries.length;
    const saveRename = (id: string) => {
        if (renameSaved.current) return;
        renameSaved.current = true;
        const title = renameDraft.trim();
        setRenamingId(null);
        if (!title) return;
        void renameQuery(id, title);
    };

    return (
        <div className="mb-4">
            <div className="mb-2 flex items-center justify-between px-3">
                <div className="text-label-xs text-soft-400">
                    {viewingArchive ? "Archive" : "Recent Queries"}
                </div>
                <button
                    type="button"
                    className="text-label-xs text-soft-400 hover:text-strong-950"
                    onClick={() => {
                        setViewingArchive((value) => !value);
                        setRenamingId(null);
                    }}
                >
                    {viewingArchive ? "back" : "archive"}
                </button>
            </div>
            <div className="px-3 pb-2">
                <input
                    value={querySearch}
                    onChange={(event) => setQuerySearch(event.target.value)}
                    placeholder="Search chats"
                    aria-label="Search past chats"
                    className="h-9 w-full rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-label-xs text-strong-950 outline-none placeholder:text-soft-400 focus:border-blue-500"
                />
            </div>
            <div className="flex flex-col gap-0.5">
                {queries.length === 0 && (
                    <div className="px-3 py-2 text-label-xs text-soft-400">
                        {querySearch.trim()
                            ? "No matching chats"
                            : viewingArchive
                              ? "No archived queries"
                              : "No queries yet"}
                    </div>
                )}
                {visibleQueries.map((q) => {
                    const active = selectedQueryId === q.id;
                    return (
                        <div
                            key={q.id}
                            className={`flex items-center gap-1 rounded-xl px-1 ${
                                active
                                    ? "bg-weak-50 dark:shadow-[0_0_0.1875rem_0_rgba(255,255,255,0.16)]"
                                    : ""
                            }`}
                        >
                            {renamingId === q.id ? (
                                <input
                                    autoFocus
                                    value={renameDraft}
                                    className="h-10 min-w-0 grow rounded-xl bg-transparent px-2 text-label-sm text-strong-950 outline-none"
                                    onChange={(event) =>
                                        setRenameDraft(event.target.value)
                                    }
                                    onBlur={() => saveRename(q.id)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            event.preventDefault();
                                            saveRename(q.id);
                                        }
                                        if (event.key === "Escape") {
                                            setRenamingId(null);
                                        }
                                    }}
                                />
                            ) : (
                                <button
                                    type="button"
                                    className="flex h-10 min-w-0 grow items-center gap-2 rounded-xl px-2 text-left text-label-sm transition-colors hover:bg-weak-50/70"
                                    onClick={() => selectQuery(q.id)}
                                >
                                    <span className="min-w-0 grow truncate">
                                        {q.title}
                                    </span>
                                    {q.pinned && !viewingArchive && (
                                        <span className="shrink-0 text-label-xs text-blue-500">
                                            pinned
                                        </span>
                                    )}
                                </button>
                            )}
                            <QueryActions
                                pinned={q.pinned}
                                archived={viewingArchive}
                                onPin={() => void pinQuery(q.id, !q.pinned)}
                                onRename={() => {
                                    renameSaved.current = false;
                                    setRenameDraft(q.title);
                                    setRenamingId(q.id);
                                }}
                                onArchive={() =>
                                    void archiveQuery(q.id, !viewingArchive)
                                }
                                onDelete={() => void deleteQuery(q.id)}
                            />
                        </div>
                    );
                })}
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
        </div>
    );
};

export default RecentQueries;
