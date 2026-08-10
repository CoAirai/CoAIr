"use client";

import { useMemo, useState } from "react";

import StatusBadge from "@/components/Admin/StatusBadge";
import { TOP_UP_REQUESTS as TOPUP_REQUESTS } from "@/lib/admin/billingDemoData";
import { resolveTopUp } from "@/lib/admin/billingSelectors";
import type { TopUpStatus } from "@/lib/admin/billingTypes";
import { COMPANIES } from "@/lib/admin/demoData";

const numberFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
});
const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
});

const companyNameById = Object.fromEntries(
    COMPANIES.map((company) => [company.id, company.name])
);

const formatDate = (date: string) => dateFormatter.format(new Date(date));

const TopupsPage = () => {
    const [requests, setRequests] = useState(TOPUP_REQUESTS);

    const pendingRequests = useMemo(
        () => requests.filter((request) => request.status === "pending"),
        [requests]
    );
    const historyRequests = useMemo(
        () => requests.filter((request) => request.status !== "pending"),
        [requests]
    );

    const handleResolve = (id: string, status: Exclude<TopUpStatus, "pending">) => {
        setRequests((current) =>
            resolveTopUp(current, id, status, new Date().toISOString())
        );
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Top-ups</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Review token top-up requests and their resolution history.
                </p>
            </div>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 p-5">
                    <h2 className="text-label-lg text-strong-950">Pending</h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Approve or deny requests waiting for review.
                    </p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">Company</th>
                                <th className="px-5 py-3 font-medium">Tokens</th>
                                <th className="px-5 py-3 font-medium">USD</th>
                                <th className="px-5 py-3 font-medium">Reason</th>
                                <th className="px-5 py-3 font-medium">Requested</th>
                                <th className="px-5 py-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {pendingRequests.map((request) => (
                                <tr key={request.id} className="text-label-sm">
                                    <td className="px-5 py-4 text-strong-950">
                                        {companyNameById[request.companyId] ?? "Unknown"}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {numberFormatter.format(request.tokensRequested)}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {currencyFormatter.format(request.amountUsd)}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {request.reason}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {formatDate(request.createdAt)}
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleResolve(request.id, "approved")
                                                }
                                                className="h-9 rounded-xl bg-blue-500 px-3 text-label-sm text-white-0 hover:bg-blue-600"
                                            >
                                                Approve
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleResolve(request.id, "denied")
                                                }
                                                className="h-9 rounded-xl border border-stroke-soft-200 px-3 text-label-sm text-strong-950 hover:bg-weak-50"
                                            >
                                                Deny
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {pendingRequests.length === 0 && (
                    <div className="px-5 py-12 text-center">
                        <p className="text-label-sm text-strong-950">
                            No pending requests
                        </p>
                        <p className="mt-1 text-label-xs text-sub-600">
                            All top-up requests have been resolved.
                        </p>
                    </div>
                )}

                <div className="border-t border-stroke-soft-200 px-5 py-3 text-label-xs text-sub-600">
                    {pendingRequests.length} pending request
                    {pendingRequests.length === 1 ? "" : "s"}
                </div>
            </section>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 p-5">
                    <h2 className="text-label-lg text-strong-950">History</h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Previously approved and denied top-up requests.
                    </p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">Company</th>
                                <th className="px-5 py-3 font-medium">Tokens</th>
                                <th className="px-5 py-3 font-medium">USD</th>
                                <th className="px-5 py-3 font-medium">Reason</th>
                                <th className="px-5 py-3 font-medium">Status</th>
                                <th className="px-5 py-3 font-medium">Resolved</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {historyRequests.map((request) => (
                                <tr key={request.id} className="text-label-sm">
                                    <td className="px-5 py-4 text-strong-950">
                                        {companyNameById[request.companyId] ?? "Unknown"}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {numberFormatter.format(request.tokensRequested)}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {currencyFormatter.format(request.amountUsd)}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {request.reason}
                                    </td>
                                    <td className="px-5 py-4">
                                        <StatusBadge status={request.status} />
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {request.resolvedAt
                                            ? formatDate(request.resolvedAt)
                                            : "—"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="border-t border-stroke-soft-200 px-5 py-3 text-label-xs text-sub-600">
                    Showing {historyRequests.length} resolved request
                    {historyRequests.length === 1 ? "" : "s"}
                </div>
            </section>
        </div>
    );
};

export default TopupsPage;
