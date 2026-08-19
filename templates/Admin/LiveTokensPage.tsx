"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import PageHeader from "@/components/Admin/PageHeader";
import StatusBadge from "@/components/Admin/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import {
    isNegativeMargin,
    marginForTokens,
} from "@/lib/billing/tokenEconomics";
import {
    apiErrorMessage,
    readTokenEconomics,
    writeTokenEconomics,
} from "@/lib/coair/commerce";
import { useLiveAdmin } from "@/lib/coair/useLiveAdmin";

const numberFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
});

const planLabel = (planType?: string) => {
    if (planType === "demo") return "Demo";
    if (planType === "legacy") return "Legacy";
    return planType || "—";
};

const LiveTokensPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const { orgs, users, loading } = useLiveAdmin();
    const [providerRate, setProviderRate] = useState("100");
    const [sellRate, setSellRate] = useState("80");
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!token) return;
        void readTokenEconomics(token)
            .then((economics) => {
                setProviderRate(String(economics.providerTokensPerUsd));
                setSellRate(String(economics.sellTokensPerUsd));
            })
            .catch((err) => setError(apiErrorMessage(err)));
    }, [token]);

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

    const rows = useMemo(() => {
        const tokensByOrg = new Map<string, { used: number; limit: number }>();
        for (const user of users) {
            const orgId = user.org_id ?? "";
            const current = tokensByOrg.get(orgId) ?? { used: 0, limit: 0 };
            current.used += user.used_tokens ?? 0;
            current.limit += user.token_limit ?? 0;
            tokensByOrg.set(orgId, current);
        }
        return orgs.map((org) => {
            const tokens = tokensByOrg.get(org.org_id);
            const tokenLimit = tokens?.limit || org.default_token_limit || 0;
            const tokensUsed = tokens?.used ?? 0;
            return {
                id: org.org_id,
                name: org.name,
                planName: planLabel(org.default_plan_type),
                tokensUsed,
                tokenLimit,
                remaining: Math.max(0, tokenLimit - tokensUsed),
                status: org.archived_at ? "suspended" : "active",
            };
        });
    }, [orgs, users]);

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
                description="Provider cost vs customer sell rate. Overage billing uses this sell rate."
            />
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
                    {error ? (
                        <p className="text-label-sm text-red-500">{error}</p>
                    ) : null}
                    {message ? (
                        <p className="text-label-sm text-green-600">{message}</p>
                    ) : null}
                </div>
            </form>

            <section className="overflow-hidden rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 px-5 py-4">
                    <h2 className="text-label-lg text-strong-950">
                        Company balances
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Used vs allocated tokens from live accounts
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">Company</th>
                                <th className="px-5 py-3 font-medium">Plan</th>
                                <th className="px-5 py-3 font-medium">Used</th>
                                <th className="px-5 py-3 font-medium">Limit</th>
                                <th className="px-5 py-3 font-medium">
                                    Remaining
                                </th>
                                <th className="px-5 py-3 font-medium">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {loading && rows.length === 0 ? (
                                <tr>
                                    <td
                                        className="px-5 py-4 text-label-sm text-sub-600"
                                        colSpan={6}
                                    >
                                        Loading companies…
                                    </td>
                                </tr>
                            ) : null}
                            {rows.map((company) => (
                                <tr key={company.id} className="text-label-sm">
                                    <td className="px-5 py-4">
                                        <Link
                                            href={`/admin/companies/${company.id}?tab=tokens`}
                                            className="text-strong-950 hover:text-blue-500"
                                        >
                                            {company.name}
                                        </Link>
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {company.planName}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {numberFormatter.format(company.tokensUsed)}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {company.tokenLimit > 0
                                            ? numberFormatter.format(
                                                  company.tokenLimit
                                              )
                                            : "—"}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {company.tokenLimit > 0
                                            ? numberFormatter.format(
                                                  company.remaining
                                              )
                                            : "—"}
                                    </td>
                                    <td className="px-5 py-4">
                                        <StatusBadge status={company.status} />
                                    </td>
                                </tr>
                            ))}
                            {!loading && rows.length === 0 ? (
                                <tr>
                                    <td
                                        className="px-5 py-4 text-label-sm text-sub-600"
                                        colSpan={6}
                                    >
                                        No companies yet.
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};

export default LiveTokensPage;
