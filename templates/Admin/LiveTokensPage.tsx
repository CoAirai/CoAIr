"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import PageHeader from "@/components/Admin/PageHeader";
import QuotaBar from "@/components/Admin/QuotaBar";
import StatusBadge from "@/components/Admin/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { planLabel } from "@/lib/admin/liveHelpers";
import {
    isNegativeMargin,
    marginForTokens,
} from "@/lib/billing/tokenEconomics";
import {
    listAdminTokenPools,
    listAdminTokenRequests,
    type CoairAdminTokenPool,
    type CoairAdminTokenRequest,
} from "@/lib/coair/admin";
import {
    apiErrorMessage,
    readTokenEconomics,
    writeTokenEconomics,
} from "@/lib/coair/commerce";

const numberFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
});

const LiveTokensPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const [pools, setPools] = useState<CoairAdminTokenPool[]>([]);
    const [requests, setRequests] = useState<CoairAdminTokenRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [providerRate, setProviderRate] = useState("100");
    const [sellRate, setSellRate] = useState("80");
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!token) {
            setPools([]);
            setRequests([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const [poolPayload, requestPayload, economics] = await Promise.all([
                listAdminTokenPools(token),
                listAdminTokenRequests(token),
                readTokenEconomics(token),
            ]);
            setPools(poolPayload.pools ?? []);
            setRequests(requestPayload.requests ?? []);
            setProviderRate(String(economics.providerTokensPerUsd));
            setSellRate(String(economics.sellTokensPerUsd));
            setError(null);
        } catch (err) {
            setError(apiErrorMessage(err));
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const previewTokens = 8000;
    const previewMargin = marginForTokens(
        previewTokens,
        Number(providerRate) || 100,
        Number(sellRate) || 80
    );
    const negativeMargin = isNegativeMargin(
        Number(providerRate) || 100,
        Number(sellRate) || 80
    );

    const platform = useMemo(() => {
        return pools.reduce(
            (acc, pool) => {
                acc.pool += pool.pool ?? 0;
                acc.used += pool.total_used ?? 0;
                acc.remaining += pool.remaining ?? 0;
                return acc;
            },
            { pool: 0, used: 0, remaining: 0 }
        );
    }, [pools]);

    const pendingRequests = useMemo(
        () => requests.filter((request) => request.status === "pending"),
        [requests]
    );

    const onSaveRates = async (event: FormEvent) => {
        event.preventDefault();
        try {
            const saved = await writeTokenEconomics(token, {
                providerTokensPerUsd: Number(providerRate),
                sellTokensPerUsd: Number(sellRate),
            });
            setProviderRate(String(saved.providerTokensPerUsd));
            setSellRate(String(saved.sellTokensPerUsd));
            setError(null);
            setMessage("Token rates saved");
        } catch (err) {
            setMessage(null);
            setError(apiErrorMessage(err));
        }
    };

    return (
        <div className="page-stack">
            <PageHeader
                title="Tokens"
                description="Live company token pools and member requests from the same data company admins and users see."
            />
            {error ? (
                <p className="text-label-sm text-red-500">{error}</p>
            ) : null}

            <section className="surface-panel p-5">
                <h2 className="text-label-lg text-strong-950">
                    Platform token pool
                </h2>
                <p className="mt-1 text-label-xs text-sub-600">
                    Sum of every active company package pool.
                </p>
                <div className="mt-4">
                    <QuotaBar
                        label="Tokens"
                        used={platform.used}
                        limit={platform.pool}
                    />
                </div>
                <p className="mt-3 text-label-sm text-sub-600">
                    Remaining across companies:{" "}
                    {numberFormatter.format(platform.remaining)}
                </p>
            </section>

            <form onSubmit={onSaveRates} className="surface-panel p-5">
                <h2 className="text-label-lg text-strong-950">Token rates</h2>
                <p className="mt-1 text-label-xs text-sub-600">
                    Provider cost vs customer sell rate (tokens per $1). Top-ups
                    and overage use the sell rate.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Provider tokens / $1
                        </span>
                        <input
                            type="number"
                            min={1}
                            value={providerRate}
                            onChange={(event) =>
                                setProviderRate(event.target.value)
                            }
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Sell tokens / $1
                        </span>
                        <input
                            type="number"
                            min={1}
                            value={sellRate}
                            onChange={(event) => setSellRate(event.target.value)}
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        />
                    </label>
                    <div className="rounded-xl bg-weak-50 p-3 text-label-xs text-sub-600 xl:col-span-2">
                        <p className="text-label-sm text-strong-950">
                            Preview ({numberFormatter.format(previewTokens)} tokens)
                        </p>
                        <p className="mt-1">
                            Charge {currencyFormatter.format(previewMargin.chargeUsd)} ·
                            Cost {currencyFormatter.format(previewMargin.providerCostUsd)} ·
                            Margin {currencyFormatter.format(previewMargin.marginUsd)} (
                            {(previewMargin.marginPct * 100).toFixed(1)}%)
                        </p>
                        {negativeMargin ? (
                            <p className="mt-1 text-warning-base">
                                Sell rate is above provider rate — margin will be
                                negative.
                            </p>
                        ) : null}
                    </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                        type="submit"
                        className="h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0 hover:opacity-90"
                    >
                        Save rates
                    </button>
                    {message ? (
                        <p className="text-label-sm text-green-600">{message}</p>
                    ) : null}
                </div>
            </form>

            <section className="overflow-hidden rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 px-5 py-4">
                    <h2 className="text-label-lg text-strong-950">
                        Company token pools
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Package pool split equally across active members
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">Company</th>
                                <th className="px-5 py-3 font-medium">Plan</th>
                                <th className="px-5 py-3 font-medium">Members</th>
                                <th className="px-5 py-3 font-medium">Pool</th>
                                <th className="px-5 py-3 font-medium">Used</th>
                                <th className="px-5 py-3 font-medium">
                                    Remaining
                                </th>
                                <th className="px-5 py-3 font-medium">
                                    Equal share
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {loading && pools.length === 0 ? (
                                <tr>
                                    <td
                                        className="px-5 py-4 text-label-sm text-sub-600"
                                        colSpan={7}
                                    >
                                        Loading token pools…
                                    </td>
                                </tr>
                            ) : null}
                            {pools.map((pool) => (
                                <tr key={pool.org_id} className="text-label-sm">
                                    <td className="px-5 py-4">
                                        <Link
                                            href={`/admin/companies/${pool.org_id}?tab=tokens`}
                                            className="text-strong-950 hover:text-blue-500"
                                        >
                                            {pool.org_name || pool.org_id}
                                        </Link>
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {planLabel(pool.subscription?.plan_id)}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {pool.member_count}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {numberFormatter.format(pool.pool)}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {numberFormatter.format(pool.total_used)}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {numberFormatter.format(pool.remaining)}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {numberFormatter.format(pool.equal_share)}
                                    </td>
                                </tr>
                            ))}
                            {!loading && pools.length === 0 ? (
                                <tr>
                                    <td
                                        className="px-5 py-4 text-label-sm text-sub-600"
                                        colSpan={7}
                                    >
                                        No company token pools yet.
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 px-5 py-4">
                    <h2 className="text-label-lg text-strong-950">
                        Member token requests
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        {pendingRequests.length} pending · company admins approve
                        transfers or purchases
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">When</th>
                                <th className="px-5 py-3 font-medium">Company</th>
                                <th className="px-5 py-3 font-medium">Member</th>
                                <th className="px-5 py-3 font-medium">Tokens</th>
                                <th className="px-5 py-3 font-medium">Reason</th>
                                <th className="px-5 py-3 font-medium">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {requests.map((request) => (
                                <tr key={request.id} className="text-label-sm">
                                    <td className="px-5 py-4 text-sub-600">
                                        {dateTimeFormatter.format(
                                            new Date(request.created_at)
                                        )}
                                    </td>
                                    <td className="px-5 py-4">
                                        <Link
                                            href={`/admin/companies/${request.org_id}?tab=tokens`}
                                            className="text-strong-950 hover:text-blue-500"
                                        >
                                            {request.org_name || request.org_id}
                                        </Link>
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {request.username}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {numberFormatter.format(request.tokens)}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {request.reason || "—"}
                                    </td>
                                    <td className="px-5 py-4">
                                        <StatusBadge
                                            status={
                                                request.status === "pending"
                                                    ? "pending"
                                                    : request.status === "approved"
                                                      ? "active"
                                                      : "suspended"
                                            }
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {!loading && requests.length === 0 ? (
                    <p className="px-5 py-12 text-center text-label-sm text-sub-600">
                        No member token requests yet.
                    </p>
                ) : null}
            </section>
        </div>
    );
};

export default LiveTokensPage;
