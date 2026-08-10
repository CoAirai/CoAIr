"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

import StatusBadge from "@/components/Admin/StatusBadge";
import { useAdminData } from "@/context/AdminDataContext";
import { usagePercent } from "@/lib/admin/adminSelectors";
import { getPlanById } from "@/lib/admin/plans";
import { getTokensRemaining } from "@/lib/admin/selectors";
import {
    isNegativeMargin,
    marginForTokens,
    providerCostUsdForTokens,
} from "@/lib/billing/tokenEconomics";

const numberFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
});

const TokensPage = () => {
    const { companies, adjustTokens, plans, tokenEconomics, updateTokenEconomics } =
        useAdminData();
    const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
    const [amount, setAmount] = useState("1000");
    const [note, setNote] = useState("");
    const [mode, setMode] = useState<"credit" | "debit">("credit");
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [providerRate, setProviderRate] = useState(
        String(tokenEconomics.providerTokensPerUsd)
    );
    const [sellRate, setSellRate] = useState(
        String(tokenEconomics.sellTokensPerUsd)
    );
    const [ratesMessage, setRatesMessage] = useState<string | null>(null);
    const [ratesError, setRatesError] = useState<string | null>(null);

    const previewTokens = 8000;
    const previewMargin = marginForTokens(
        previewTokens,
        Number(providerRate) || tokenEconomics.providerTokensPerUsd,
        Number(sellRate) || tokenEconomics.sellTokensPerUsd
    );
    const negativeMargin = isNegativeMargin(
        Number(providerRate) || tokenEconomics.providerTokensPerUsd,
        Number(sellRate) || tokenEconomics.sellTokensPerUsd
    );

    const sortedCompanies = useMemo(
        () =>
            [...companies].sort(
                (a, b) => getTokensRemaining(a) - getTokensRemaining(b)
            ),
        [companies]
    );

    const onSubmit = (event: FormEvent) => {
        event.preventDefault();
        const value = Number(amount);
        if (!companyId || !Number.isFinite(value) || value <= 0) {
            setError("Enter a valid positive amount");
            setMessage(null);
            return;
        }
        const delta = mode === "credit" ? value : -value;
        const result = adjustTokens(companyId, delta, note.trim());
        if (!result.ok) {
            setError(result.error ?? "Adjustment failed");
            setMessage(null);
            return;
        }
        setError(null);
        setMessage(
            `${mode === "credit" ? "Credited" : "Debited"} ${numberFormatter.format(value)} tokens`
        );
        setNote("");
    };

    const onSaveRates = (event: FormEvent) => {
        event.preventDefault();
        const result = updateTokenEconomics({
            providerTokensPerUsd: Number(providerRate),
            sellTokensPerUsd: Number(sellRate),
        });
        if (!result.ok) {
            setRatesError(result.error ?? "Unable to save rates");
            setRatesMessage(null);
            return;
        }
        setRatesError(null);
        setRatesMessage("Token rates saved");
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Tokens</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Company token balances sorted by remaining quota. Set wholesale
                    and retail rates, then credit or debit below.
                </p>
            </div>

            <form
                onSubmit={onSaveRates}
                className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5"
            >
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
                            onChange={(e) => setProviderRate(e.target.value)}
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
                            onChange={(e) => setSellRate(e.target.value)}
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
                                Sell rate is above provider rate — margin will be negative.
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
                    {ratesMessage ? (
                        <p className="text-label-sm text-green-600">{ratesMessage}</p>
                    ) : null}
                    {ratesError ? (
                        <p className="text-label-sm text-red-500">{ratesError}</p>
                    ) : null}
                </div>
            </form>

            <section className="overflow-hidden rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 px-5 py-4">
                    <h2 className="text-label-lg text-strong-950">
                        By company
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Sorted by remaining tokens (lowest first)
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[880px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">
                                    Company
                                </th>
                                <th className="px-5 py-3 font-medium">Plan</th>
                                <th className="px-5 py-3 font-medium">Used</th>
                                <th className="px-5 py-3 font-medium">Limit</th>
                                <th className="px-5 py-3 font-medium">
                                    Remaining
                                </th>
                                <th className="px-5 py-3 font-medium">
                                    Est. provider cost
                                </th>
                                <th className="px-5 py-3 font-medium">Usage</th>
                                <th className="px-5 py-3 font-medium">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {sortedCompanies.map((company) => {
                                const remaining = getTokensRemaining(company);
                                const percent = usagePercent(
                                    company.tokensUsed,
                                    company.tokenLimit
                                );
                                const isLowBalance =
                                    company.tokenLimit > 0 &&
                                    remaining / company.tokenLimit < 0.1;

                                return (
                                    <tr
                                        key={company.id}
                                        className="text-label-sm"
                                    >
                                        <td className="px-5 py-4">
                                            <Link
                                                href={`/admin/companies/${company.id}?tab=tokens`}
                                                className="text-strong-950 hover:text-blue-500"
                                            >
                                                {company.name}
                                            </Link>
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {getPlanById(company.planId, plans)?.name ??
                                                "Unknown"}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {numberFormatter.format(
                                                company.tokensUsed
                                            )}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {numberFormatter.format(
                                                company.tokenLimit
                                            )}
                                        </td>
                                        <td
                                            className={`px-5 py-4 ${
                                                isLowBalance
                                                    ? "text-warning-base"
                                                    : "text-sub-600"
                                            }`}
                                        >
                                            {numberFormatter.format(remaining)}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {currencyFormatter.format(
                                                providerCostUsdForTokens(
                                                    company.tokensUsed,
                                                    tokenEconomics.providerTokensPerUsd
                                                )
                                            )}
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="min-w-[120px]">
                                                <span className="text-label-xs text-sub-600">
                                                    {percent}%
                                                </span>
                                                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-weak-50">
                                                    <div
                                                        className={`h-full rounded-full transition-[width] ${
                                                            percent >= 90
                                                                ? "bg-warning-base"
                                                                : "bg-blue-500"
                                                        }`}
                                                        style={{
                                                            width: `${percent}%`,
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <StatusBadge
                                                status={company.status}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

            <form
                onSubmit={onSubmit}
                className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5"
            >
                <h2 className="text-label-lg text-strong-950">
                    Manual token adjustment
                </h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Company
                        </span>
                        <select
                            value={companyId}
                            onChange={(e) => setCompanyId(e.target.value)}
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        >
                            {companies.map((company) => (
                                <option key={company.id} value={company.id}>
                                    {company.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Action
                        </span>
                        <select
                            value={mode}
                            onChange={(e) =>
                                setMode(e.target.value as "credit" | "debit")
                            }
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        >
                            <option value="credit">Credit (add)</option>
                            <option value="debit">Debit (remove)</option>
                        </select>
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Amount
                        </span>
                        <input
                            type="number"
                            min={1}
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Note
                        </span>
                        <input
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Support case #123"
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        />
                    </label>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                        type="submit"
                        className="h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0 hover:opacity-90"
                    >
                        Apply adjustment
                    </button>
                    {message && (
                        <p className="text-label-sm text-green-600">{message}</p>
                    )}
                    {error && (
                        <p className="text-label-sm text-red-500">{error}</p>
                    )}
                </div>
            </form>
        </div>
    );
};

export default TokensPage;
