"use client";

import { useMemo, useState } from "react";

import PageHeader from "@/components/Admin/PageHeader";
import QuotaBar from "@/components/Admin/QuotaBar";
import StatCard from "@/components/Admin/StatCard";
import StatusBadge from "@/components/Admin/StatusBadge";
import CheckoutModal from "@/components/Company/CheckoutModal";
import { useCompanyData } from "@/context/CompanyDataContext";
import { getPlanById, PLAN_ORDER } from "@/lib/admin/plans";
import type { PlanId } from "@/lib/admin/types";
import {
    chargeUsdForTokens,
    effectiveSellRate,
} from "@/lib/billing/tokenEconomics";

const STORAGE_USD_PER_GB = 1;

const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
});
const numberFormatter = new Intl.NumberFormat("en-US");
const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
});

const formatDate = (date: string) =>
    dateFormatter.format(new Date(`${date}T00:00:00`));

type CheckoutState =
    | {
          kind: "tokens";
          amount: number;
          priceUsd: number;
          label: string;
      }
    | { kind: "storage"; gb: number; priceUsd: number; label: string }
    | {
          kind: "upgrade";
          planId: PlanId;
          planName: string;
          priceLabel: string;
          priceUsd: number;
      }
    | null;

const BillingPage = () => {
    const {
        company,
        invoices,
        buyExtraTokens,
        buyExtraStorage,
        upgradePlan,
        plans,
        tokenEconomics,
    } = useCompanyData();

    const [checkout, setCheckout] = useState<CheckoutState>(null);
    const [tokenAmountInput, setTokenAmountInput] = useState("5000");
    const [storageGbInput, setStorageGbInput] = useState("50");
    const [customRequirement, setCustomRequirement] = useState("");
    const [customNote, setCustomNote] = useState<string | null>(null);

    const sellRate = effectiveSellRate(
        tokenEconomics,
        company.sellTokensPerUsdOverride
    );
    const tokenAmount = Math.max(0, Math.floor(Number(tokenAmountInput) || 0));
    const tokenPriceUsd = chargeUsdForTokens(tokenAmount, sellRate);
    const storageGb = Math.max(0, Math.floor(Number(storageGbInput) || 0));
    const storagePriceUsd = storageGb * STORAGE_USD_PER_GB;

    const plan = getPlanById(company.planId, plans);
    const currentPlanIndex = PLAN_ORDER.indexOf(company.planId);

    const upgradePlans = useMemo(
        () =>
            plans.filter(
                (entry) => PLAN_ORDER.indexOf(entry.id) > currentPlanIndex
            ),
        [plans, currentPlanIndex]
    );

    const handleConfirm = () => {
        if (!checkout) return { ok: false, error: "No purchase selected" };

        if (checkout.kind === "tokens") {
            buyExtraTokens(checkout.amount);
            return { ok: true };
        }
        if (checkout.kind === "storage") {
            buyExtraStorage(checkout.gb);
            return { ok: true };
        }
        return upgradePlan(checkout.planId);
    };

    const checkoutTitle =
        checkout?.kind === "upgrade"
            ? `Upgrade to ${checkout.planName}`
            : checkout?.kind === "tokens"
              ? "Buy extra tokens"
              : checkout?.kind === "storage"
                ? "Buy extra storage"
                : "";

    const checkoutSummary =
        checkout?.kind === "upgrade"
            ? `Switch your plan to ${checkout.planName}. Base limits will be reset to the new plan.`
            : checkout?.kind === "tokens"
              ? `Add ${checkout.label} to your company token pool.`
              : checkout?.kind === "storage"
                ? `Add ${checkout.label} to your company storage limit.`
                : "";

    const checkoutAmount =
        checkout?.kind === "upgrade"
            ? checkout.priceLabel
            : checkout
              ? currencyFormatter.format(checkout.priceUsd)
              : "";

    return (
        <div className="page-stack">
            <PageHeader
                title="Billing"
                description="View invoices, purchase capacity, or upgrade your plan."
            />

            <section className="surface-panel p-5">
                <h2 className="text-label-lg text-strong-950">Current plan</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        label="Plan"
                        value={plan?.name ?? "Unknown"}
                        hint={plan?.priceLabel ?? "—"}
                    />
                    <StatCard
                        label="Token limit"
                        value={numberFormatter.format(company.tokenLimit)}
                        hint={`${numberFormatter.format(company.tokensUsed)} used`}
                    />
                    <StatCard
                        label="Storage limit"
                        value={`${numberFormatter.format(company.storageLimitGb)} GB`}
                        hint={`${numberFormatter.format(company.storageUsedGb)} GB used`}
                    />
                    <StatCard
                        label="Team size"
                        value={numberFormatter.format(company.usersCount)}
                        hint="Active seats on plan"
                    />
                </div>
                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                    <QuotaBar
                        label="Tokens"
                        used={company.tokensUsed}
                        limit={company.tokenLimit}
                    />
                    <QuotaBar
                        label="Storage"
                        used={company.storageUsedGb}
                        limit={company.storageLimitGb}
                        unit="GB"
                    />
                </div>
            </section>

            <section className="surface-panel overflow-hidden">
                <div className="surface-panel-header">
                    <h2 className="text-label-lg text-strong-950">Invoices</h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        View-only billing history for your company.
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="surface-table w-full min-w-[640px] text-left">
                        <thead>
                            <tr>
                                <th>Invoice</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Issued</th>
                                <th>Due</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {invoices.map((invoice) => (
                                <tr key={invoice.id}>
                                    <td className="text-strong-950">
                                        {invoice.id}
                                    </td>
                                    <td className="tabular-nums text-sub-600">
                                        {currencyFormatter.format(
                                            invoice.amountUsd
                                        )}
                                    </td>
                                    <td>
                                        <StatusBadge
                                            status={invoice.status.replaceAll(
                                                "_",
                                                " "
                                            )}
                                        />
                                    </td>
                                    <td className="text-sub-600">
                                        {formatDate(invoice.issuedAt)}
                                    </td>
                                    <td className="text-sub-600">
                                        {formatDate(invoice.dueAt)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {invoices.length === 0 && (
                    <p className="px-5 py-12 text-center text-label-sm text-sub-600">
                        No invoices yet.
                    </p>
                )}
            </section>

            <div className="grid gap-6 xl:grid-cols-2">
                <section className="surface-panel p-5">
                    <h2 className="text-label-lg text-strong-950">
                        Extra tokens
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Enter the tokens you need. Priced at {sellRate} tokens
                        per $1.
                    </p>
                    <label className="mt-4 block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Tokens needed
                        </span>
                        <input
                            type="number"
                            min={1}
                            step={1}
                            value={tokenAmountInput}
                            onChange={(event) =>
                                setTokenAmountInput(event.target.value)
                            }
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        />
                    </label>
                    <p className="mt-3 text-label-sm text-strong-950">
                        Estimated:{" "}
                        {tokenAmount > 0
                            ? currencyFormatter.format(tokenPriceUsd)
                            : "—"}
                    </p>
                    <button
                        type="button"
                        disabled={tokenAmount < 1}
                        onClick={() =>
                            setCheckout({
                                kind: "tokens",
                                amount: tokenAmount,
                                priceUsd: tokenPriceUsd,
                                label: `${numberFormatter.format(tokenAmount)} tokens`,
                            })
                        }
                        className="mt-4 h-9 rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 hover:bg-blue-600 disabled:opacity-50"
                    >
                        Buy
                    </button>
                </section>

                <section className="surface-panel p-5">
                    <h2 className="text-label-lg text-strong-950">
                        Extra storage
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Enter how much storage you need ($
                        {STORAGE_USD_PER_GB}/GB).
                    </p>
                    <label className="mt-4 block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Storage needed (GB)
                        </span>
                        <input
                            type="number"
                            min={1}
                            step={1}
                            value={storageGbInput}
                            onChange={(event) =>
                                setStorageGbInput(event.target.value)
                            }
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        />
                    </label>
                    <p className="mt-3 text-label-sm text-strong-950">
                        Estimated:{" "}
                        {storageGb > 0
                            ? currencyFormatter.format(storagePriceUsd)
                            : "—"}
                    </p>
                    <button
                        type="button"
                        disabled={storageGb < 1}
                        onClick={() =>
                            setCheckout({
                                kind: "storage",
                                gb: storageGb,
                                priceUsd: storagePriceUsd,
                                label: `${numberFormatter.format(storageGb)} GB`,
                            })
                        }
                        className="mt-4 h-9 rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 hover:bg-blue-600 disabled:opacity-50"
                    >
                        Buy
                    </button>
                </section>
            </div>

            <section className="surface-panel p-5">
                <h2 className="text-label-lg text-strong-950">Upgrade plan</h2>
                <p className="mt-1 text-label-xs text-sub-600">
                    Move to a higher tier. Blocked if current usage exceeds the
                    new plan limits.
                </p>
                {upgradePlans.length === 0 ? (
                    <p className="mt-4 text-label-sm text-sub-600">
                        You are on the highest available plan.
                    </p>
                ) : (
                    <div className="mt-4 space-y-3">
                        {upgradePlans.map((target) => (
                            <div
                                key={target.id}
                                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-stroke-soft-200 px-4 py-3"
                            >
                                <div>
                                    <p className="text-label-sm text-strong-950">
                                        {target.name}
                                    </p>
                                    <p className="text-label-xs text-sub-600">
                                        {target.priceLabel} ·{" "}
                                        {target.usersIncluded} seats · $
                                        {target.apiCreditsUsd} credits ·{" "}
                                        {numberFormatter.format(target.queryCap)}{" "}
                                        queries · {target.storageLimitGb} GB
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setCheckout({
                                            kind: "upgrade",
                                            planId: target.id,
                                            planName: target.name,
                                            priceLabel: target.priceLabel,
                                            priceUsd: target.apiCreditsUsd,
                                        })
                                    }
                                    className="h-9 shrink-0 rounded-xl bg-strong-950 px-4 text-label-sm text-white-0 hover:opacity-90"
                                >
                                    Upgrade
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="surface-panel p-5">
                <h2 className="text-label-lg text-strong-950">
                    Custom purchase request
                </h2>
                <p className="mt-1 text-label-xs text-sub-600">
                    Modules are included with your package. Describe any other
                    purchase you need.
                </p>
                <textarea
                    value={customRequirement}
                    onChange={(event) => {
                        setCustomRequirement(event.target.value);
                        setCustomNote(null);
                    }}
                    rows={4}
                    className="mt-4 w-full rounded-xl border border-stroke-soft-200 px-3 py-2 text-label-sm outline-none focus:border-blue-500"
                    placeholder="Describe what you need…"
                />
                <button
                    type="button"
                    onClick={() => {
                        if (customRequirement.trim().length < 3) {
                            setCustomNote("Add a short description first.");
                            return;
                        }
                        setCustomNote(
                            "Request saved locally. On live billing this goes to Super Admin for approval."
                        );
                        setCustomRequirement("");
                    }}
                    className="mt-4 h-9 rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 hover:bg-blue-600"
                >
                    Submit request
                </button>
                {customNote ? (
                    <p className="mt-2 text-label-xs text-sub-600">{customNote}</p>
                ) : null}
            </section>

            <CheckoutModal
                open={checkout !== null}
                onClose={() => setCheckout(null)}
                title={checkoutTitle}
                summary={checkoutSummary}
                amountLabel={checkoutAmount}
                onConfirm={handleConfirm}
            />
        </div>
    );
};

export default BillingPage;
