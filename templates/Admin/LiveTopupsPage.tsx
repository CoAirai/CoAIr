"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import PageHeader from "@/components/Admin/PageHeader";
import { AdminTopupsTableSkeleton } from "@/components/Skeleton/sections";
import StatusBadge from "@/components/Admin/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import type { TopUpRequest } from "@/lib/admin/billingTypes";
import { adjustAdminCredits } from "@/lib/coair/admin";
import { apiErrorMessage } from "@/lib/coair/commerce";
import {
    approveAdminTopup,
    denyAdminTopup,
    listAdminTopups,
} from "@/lib/coair/ops";
import { useLiveAdmin } from "@/lib/coair/useLiveAdmin";

const numberFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
});

const LiveTopupsPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const { orgs, users, loading, error, refresh } = useLiveAdmin();
    const [username, setUsername] = useState("");
    const [credits, setCredits] = useState("100");
    const [reason, setReason] = useState("Manual top-up");
    const [requests, setRequests] = useState<TopUpRequest[]>([]);
    const [message, setMessage] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const loadRequests = useCallback(async () => {
        if (!token) return;
        try {
            setRequests(await listAdminTopups(token));
        } catch (err) {
            setActionError(apiErrorMessage(err));
        }
    }, [token]);

    useEffect(() => {
        void loadRequests();
    }, [loadRequests]);

    const companyNameById = useMemo(
        () => Object.fromEntries(orgs.map((org) => [org.org_id, org.name])),
        [orgs]
    );
    const pendingRequests = requests.filter(
        (request) => request.status === "pending"
    );
    const historyRequests = requests.filter(
        (request) => request.status !== "pending"
    );

    const onSubmit = async (event: FormEvent) => {
        event.preventDefault();
        const amount = Number(credits);
        if (!username || !Number.isFinite(amount) || amount === 0) {
            setActionError("Choose a user and a non-zero credit amount");
            return;
        }
        try {
            await adjustAdminCredits(token, username, {
                credits: amount,
                reason: reason.trim() || "Manual top-up",
            });
            setMessage(
                `${amount > 0 ? "Credited" : "Debited"} ${Math.abs(amount)} credits to ${username}`
            );
            setActionError(null);
            await refresh();
        } catch (err) {
            setMessage(null);
            setActionError(apiErrorMessage(err));
        }
    };

    const resolve = async (id: string, action: "approved" | "denied") => {
        try {
            if (action === "approved") {
                await approveAdminTopup(token, id);
            } else {
                await denyAdminTopup(token, id);
            }
            setMessage(
                action === "approved" ? "Top-up approved" : "Top-up denied"
            );
            setActionError(null);
            await Promise.all([loadRequests(), refresh()]);
        } catch (err) {
            setMessage(null);
            setActionError(apiErrorMessage(err));
        }
    };

    return (
        <div className="page-stack">
            <PageHeader
                title="Top-ups"
                description="Approve company token requests, then grant or claw back credits on live accounts."
            />
            {error || actionError ? (
                <p className="text-label-sm text-red-500">
                    {actionError ?? error}
                </p>
            ) : null}
            {message ? (
                <p className="text-label-sm text-green-600">{message}</p>
            ) : null}

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 px-5 py-4">
                    <h2 className="text-label-lg text-strong-950">Pending</h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Approve credits the company owner and raises their token
                        limit.
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[960px] text-left">
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
                                        {companyNameById[request.companyId] ??
                                            request.companyId}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {numberFormatter.format(
                                            request.tokensRequested
                                        )}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {currencyFormatter.format(
                                            request.amountUsd
                                        )}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {request.reason}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {dateFormatter.format(
                                            new Date(request.createdAt)
                                        )}
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    void resolve(
                                                        request.id,
                                                        "approved"
                                                    )
                                                }
                                                className="h-9 rounded-xl bg-blue-500 px-3 text-label-sm text-white-0 hover:bg-blue-600"
                                            >
                                                Approve
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    void resolve(
                                                        request.id,
                                                        "denied"
                                                    )
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
                {pendingRequests.length === 0 ? (
                    <p className="px-5 py-12 text-center text-label-sm text-sub-600">
                        No pending requests
                    </p>
                ) : null}
            </section>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 px-5 py-4">
                    <h2 className="text-label-lg text-strong-950">History</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-left">
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
                                        {companyNameById[request.companyId] ??
                                            request.companyId}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {numberFormatter.format(
                                            request.tokensRequested
                                        )}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {currencyFormatter.format(
                                            request.amountUsd
                                        )}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {request.reason}
                                    </td>
                                    <td className="px-5 py-4">
                                        <StatusBadge status={request.status} />
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {request.resolvedAt
                                            ? dateFormatter.format(
                                                  new Date(request.resolvedAt)
                                              )
                                            : "—"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {historyRequests.length === 0 ? (
                    <p className="px-5 py-8 text-center text-label-sm text-sub-600">
                        No resolved requests yet.
                    </p>
                ) : null}
            </section>

            <form
                onSubmit={(event) => void onSubmit(event)}
                className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5"
            >
                <h2 className="text-label-lg text-strong-950">Adjust credits</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            User
                        </span>
                        <select
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        >
                            <option value="">Select user</option>
                            {users.map((user) => (
                                <option key={user.username} value={user.username}>
                                    {user.display_name || user.username}
                                    {user.org_name ? ` · ${user.org_name}` : ""}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Credits (+ add / − remove)
                        </span>
                        <input
                            type="number"
                            value={credits}
                            onChange={(event) => setCredits(event.target.value)}
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        />
                    </label>
                    <label className="block xl:col-span-2">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Reason
                        </span>
                        <input
                            required
                            minLength={3}
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        />
                    </label>
                </div>
                <button
                    type="submit"
                    className="mt-4 h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0"
                >
                    Apply
                </button>
            </form>
            <AdminTopupsTableSkeleton loading={loading && users.length === 0}>
                <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                    <div className="border-b border-stroke-soft-200 px-5 py-4">
                        <h2 className="text-label-lg text-strong-950">
                            Account balances
                        </h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-left">
                            <thead className="bg-weak-50 text-label-xs text-sub-600">
                                <tr>
                                    <th className="px-5 py-3 font-medium">User</th>
                                    <th className="px-5 py-3 font-medium">Company</th>
                                    <th className="px-5 py-3 font-medium">
                                        Remaining
                                    </th>
                                    <th className="px-5 py-3 font-medium">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stroke-soft-200">
                                {users.map((user) => (
                                    <tr key={user.username} className="text-label-sm">
                                        <td className="px-5 py-4 text-strong-950">
                                            {user.display_name || user.username}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {user.org_name || "—"}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {numberFormatter.format(
                                                user.credits_remaining ?? 0
                                            )}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {numberFormatter.format(
                                                user.credits_total ?? 0
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </AdminTopupsTableSkeleton>
        </div>
    );
};

export default LiveTopupsPage;
