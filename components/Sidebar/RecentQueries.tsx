"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import type { ChronologyReport } from "@/lib/chronology/types";
import { mapChronologyJob } from "@/lib/coair/mapChronology";
import { listReports } from "@/lib/coair/reports";
import { ownedByUser } from "@/lib/workspace/ownedByUser";

const RecentQueries = () => {
    const pathname = usePathname();
    const router = useRouter();
    const isChronology = pathname.startsWith("/workspace/chronology");
    const {
        selectedQueryId,
        selectQuery,
        recentQueries,
        activeWorkspaceUserId,
    } = useChat();
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
    const activeChronologyId = pathname.startsWith("/workspace/chronology/")
        ? pathname.split("/workspace/chronology/")[1]
        : null;

    if (isChronology) {
        const reports = live ? liveReports : chronologyReports;
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
                <div className="flex flex-col gap-0.5">
                    {reports.length === 0 && (
                        <div className="px-3 py-2 text-label-xs text-soft-400">
                            No chronology reports yet
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

    return (
        <div className="mb-4">
            <div className="mb-2 flex items-center justify-between px-3">
                <div className="text-label-xs text-soft-400">Recent Queries</div>
                <span className="text-label-xs text-soft-400">archive</span>
            </div>
            <div className="flex flex-col gap-0.5">
                {recentQueries.length === 0 && (
                    <div className="px-3 py-2 text-label-xs text-soft-400">
                        No queries yet
                    </div>
                )}
                {recentQueries.map((q) => {
                    const active = selectedQueryId === q.id;
                    return (
                        <button
                            key={q.id}
                            type="button"
                            className={`h-10 px-3 rounded-xl text-left text-label-sm truncate transition-colors ${
                                active
                                    ? "bg-weak-50 dark:shadow-[0_0_0.1875rem_0_rgba(255,255,255,0.16)]"
                                    : "hover:bg-weak-50/70"
                            }`}
                            onClick={() => selectQuery(q.id)}
                        >
                            {q.title}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default RecentQueries;
