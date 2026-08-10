"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
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
    const workspace = session?.companyId
        ? companyWorkspaces[session.companyId]
        : undefined;
    const chronologyReports = ownedByUser(
        workspace?.chronologyReports ?? [],
        activeWorkspaceUserId ?? session?.userId
    );
    const activeChronologyId = pathname.startsWith("/workspace/chronology/")
        ? pathname.split("/workspace/chronology/")[1]
        : null;

    if (isChronology) {
        const reports = chronologyReports;
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
                                    if (report.status === "ready") {
                                        router.push(`${hrefBase}/${report.id}`);
                                    }
                                }}
                                disabled={report.status !== "ready"}
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
