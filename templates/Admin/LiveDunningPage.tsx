"use client";

import { useCallback, useEffect, useState } from "react";

import { AdminDunningTableSkeleton } from "@/components/Skeleton/sections";
import StatusBadge from "@/components/Admin/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import type { DunningCase } from "@/lib/admin/billingTypes";
import { apiErrorMessage } from "@/lib/coair/commerce";
import { extendDunning, listDunning, retryDunning } from "@/lib/coair/ops";
import { useLiveAdmin } from "@/lib/coair/useLiveAdmin";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
});

const formatDate = (date: string) =>
    dateFormatter.format(
        new Date(date.length <= 10 ? `${date}T00:00:00` : date)
    );

const LiveDunningPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const { orgs } = useLiveAdmin();
    const [cases, setCases] = useState<DunningCase[]>([]);
    const [casesReady, setCasesReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!token) {
            setCases([]);
            setCasesReady(true);
            return;
        }
        try {
            setCases(await listDunning(token));
            setError(null);
        } catch (err) {
            setError(apiErrorMessage(err));
        } finally {
            setCasesReady(true);
        }
    }, [token]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const companyName = (companyId: string) =>
        orgs.find((org) => org.org_id === companyId)?.name ?? companyId;

    const handleRetry = async (id: string) => {
        try {
            await retryDunning(token, id);
            await refresh();
        } catch (err) {
            setError(apiErrorMessage(err));
        }
    };

    const handleExtend = async (id: string) => {
        try {
            await extendDunning(token, id);
            await refresh();
        } catch (err) {
            setError(apiErrorMessage(err));
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Dunning</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Manage failed-payment recovery and account grace periods.
                </p>
            </div>
            {error ? (
                <p className="text-label-sm text-red-500">{error}</p>
            ) : null}

            <AdminDunningTableSkeleton loading={!casesReady && cases.length === 0}>
                <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                    <div className="border-b border-stroke-soft-200 p-5">
                        <h2 className="text-label-lg text-strong-950">
                            Recovery cases
                        </h2>
                        <p className="mt-1 text-label-xs text-sub-600">
                            Retry payment collection or extend a grace period by
                            seven days.
                        </p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[980px] text-left">
                            <thead className="bg-weak-50 text-label-xs text-sub-600">
                                <tr>
                                    <th className="px-5 py-3 font-medium">Company</th>
                                    <th className="px-5 py-3 font-medium">Status</th>
                                    <th className="px-5 py-3 font-medium">Failed</th>
                                    <th className="px-5 py-3 font-medium">
                                        Grace ends
                                    </th>
                                    <th className="px-5 py-3 font-medium">
                                        Attempts
                                    </th>
                                    <th className="px-5 py-3 font-medium">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stroke-soft-200">
                                {cases.map((dunningCase) => (
                                    <tr key={dunningCase.id} className="text-label-sm">
                                        <td className="px-5 py-4 text-strong-950">
                                            {companyName(dunningCase.companyId)}
                                        </td>
                                        <td className="px-5 py-4">
                                            <StatusBadge
                                                status={dunningCase.status}
                                            />
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {formatDate(dunningCase.failedAt)}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {formatDate(dunningCase.graceEndsAt)}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {dunningCase.attemptCount}
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void handleRetry(
                                                            dunningCase.id
                                                        )
                                                    }
                                                    className="h-9 rounded-xl bg-blue-500 px-3 text-label-sm text-white-0 hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    Retry
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void handleExtend(
                                                            dunningCase.id
                                                        )
                                                    }
                                                    className="h-9 rounded-xl border border-stroke-soft-200 px-3 text-label-sm text-strong-950 hover:bg-weak-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    Extend grace (+7)
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {casesReady && cases.length === 0 ? (
                        <p className="px-5 py-12 text-center text-label-sm text-sub-600">
                            No dunning cases
                        </p>
                    ) : null}
                    <div className="border-t border-stroke-soft-200 px-5 py-3 text-label-xs text-sub-600">
                        Showing {cases.length} dunning cases
                    </div>
                </section>
            </AdminDunningTableSkeleton>
        </div>
    );
};

export default LiveDunningPage;
