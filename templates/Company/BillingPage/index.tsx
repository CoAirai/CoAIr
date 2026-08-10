"use client";

import { useMemo, useState } from "react";

import QuotaBar from "@/components/Admin/QuotaBar";
import StatCard from "@/components/Admin/StatCard";
import StatusBadge from "@/components/Admin/StatusBadge";
import CheckoutModal from "@/components/Company/CheckoutModal";
import { useCompanyData } from "@/context/CompanyDataContext";
import { getPlanById, PLAN_ORDER } from "@/lib/admin/plans";
import type { ModuleId, PlanId } from "@/lib/admin/types";
import {
    chargeUsdForTokens,
    effectiveSellRate,
} from "@/lib/billing/tokenEconomics";

const TOKEN_AMOUNTS = [1000, 5000, 10000] as const;

const STORAGE_PACKS = [
    { gb: 10 as const, priceUsd: 10, label: "10 GB" },
    { gb: 50 as const, priceUsd: 40, label: "50 GB" },
    { gb: 100 as const, priceUsd: 70, label: "100 GB" },
];

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
          amount: 1000 | 5000 | 10000;
          priceUsd: number;
          label: string;
      }
    | { kind: "storage"; gb: 10 | 50 | 100; priceUsd: number; label: string }
    | {
          kind: "upgrade";
          planId: PlanId;
          planName: string;
          priceLabel: string;
      }
    | {
          kind: "addon";
          moduleId: ModuleId;
          label: string;
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
        buyAddOn,
        plans,
        tokenEconomics,
    } = useCompanyData();

    const [checkout, setCheckout] = useState<CheckoutState>(null);

    const sellRate = effectiveSellRate(
        tokenEconomics,
        company.sellTokensPerUsdOverride
    );
    const tokenPacks = useMemo(
        () =>
            TOKEN_AMOUNTS.map((amount) => ({
                amount,
                priceUsd: chargeUsdForTokens(amount, sellRate),
                label: `${amount.toLocaleString()} tokens`,
            })),
        [sellRate]
    );

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
        if (checkout.kind === "addon") {
            return buyAddOn(checkout.moduleId);
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
                : checkout?.kind === "addon"
                  ? `Enable ${checkout.label}`
                  : "";

    const checkoutSummary =
        checkout?.kind === "upgrade"
            ? `Switch your plan to ${checkout.planName}. Base limits will be reset to the new plan.`
            : checkout?.kind === "tokens"
              ? `Add ${checkout.label} to your company token pool.`
              : checkout?.kind === "storage"
                ? `Add ${checkout.label} to your company storage limit.`
                : checkout?.kind === "addon"
                  ? `Unlock ${checkout.label} for everyone in this company.`
                  : "";

    const checkoutAmount =
        checkout?.kind === "upgrade"
            ? checkout.priceLabel
            : checkout
              ? currencyFormatter.format(checkout.priceUsd)
              : "";

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Billing</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    View invoices, purchase add-ons, or upgrade your plan.
                </p>
            </div>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
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

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 p-5">
                    <h2 className="text-label-lg text-strong-950">Invoices</h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        View-only billing history for your company.
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">Invoice</th>
                                <th className="px-5 py-3 font-medium">Amount</th>
                                <th className="px-5 py-3 font-medium">Status</th>
                                <th className="px-5 py-3 font-medium">Issued</th>
                                <th className="px-5 py-3 font-medium">Due</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {invoices.map((invoice) => (
                                <tr key={invoice.id} className="text-label-sm">
                                    <td className="px-5 py-4 text-strong-950">
                                        {invoice.id}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {currencyFormatter.format(
                                            invoice.amountUsd
                                        )}
                                    </td>
                                    <td className="px-5 py-4">
                                        <StatusBadge
                                            status={invoice.status.replaceAll(
                                                "_",
                                                " "
                                            )}
                                        />
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {formatDate(invoice.issuedAt)}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
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
                <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                    <h2 className="text-label-lg text-strong-950">
                        Buy extra tokens
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        One-time packs added to your current token limit. Priced
                        at {sellRate} tokens per $1.
                        Overage is billed at the same rate.
                    </p>
                    <div className="mt-4 space-y-3">
                        {tokenPacks.map((pack) => (
                            <div
                                key={pack.amount}
                                className="flex items-center justify-between gap-4 rounded-xl border border-stroke-soft-200 px-4 py-3"
                            >
                                <div>
                                    <p className="text-label-sm text-strong-950">
                                        {pack.label}
                                    </p>
                                    <p className="text-label-xs text-sub-600">
                                        {currencyFormatter.format(pack.priceUsd)}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setCheckout({
                                            kind: "tokens",
                                            ...pack,
                                        })
                                    }
                                    className="h-9 shrink-0 rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 hover:bg-blue-600"
                                >
                                    Buy
                                </button>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                    <h2 className="text-label-lg text-strong-950">
                        Buy extra storage
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        One-time packs added to your storage limit.
                    </p>
                    <div className="mt-4 space-y-3">
                        {STORAGE_PACKS.map((pack) => (
                            <div
                                key={pack.gb}
                                className="flex items-center justify-between gap-4 rounded-xl border border-stroke-soft-200 px-4 py-3"
                            >
                                <div>
                                    <p className="text-label-sm text-strong-950">
                                        {pack.label}
                                    </p>
                                    <p className="text-label-xs text-sub-600">
                                        {currencyFormatter.format(pack.priceUsd)}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setCheckout({
                                            kind: "storage",
                                            ...pack,
                                        })
                                    }
                                    className="h-9 shrink-0 rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 hover:bg-blue-600"
                                >
                                    Buy
                                </button>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                <h2 className="text-label-lg text-strong-950">
                    Upgrade plan
                </h2>
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

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                <h2 className="text-label-lg text-strong-950">
                    Module add-ons
                </h2>
                <p className="mt-1 text-label-xs text-sub-600">
                    Unlock Chronology or Forensic Delay Analysis for this
                    company.
                </p>
                <div className="mt-4 space-y-3">
                    {(
                        [
                            {
                                id: "chronology" as const,
                                label: "Chronology",
                                priceUsd: 250,
                            },
                            {
                                id: "forensic" as const,
                                label: "Forensic Delay Analysis",
                                priceUsd: 400,
                            },
                        ]
                    ).map((addon) => {
                        const owned = company.addOns.includes(addon.id);
                        return (
                            <div
                                key={addon.id}
                                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-stroke-soft-200 px-4 py-3"
                            >
                                <div>
                                    <p className="text-label-sm text-strong-950">
                                        {addon.label}
                                    </p>
                                    <p className="text-label-xs text-sub-600">
                                        {owned
                                            ? "Enabled for this company"
                                            : `${currencyFormatter.format(addon.priceUsd)} / month`}
                                    </p>
                                </div>
                                {owned ? (
                                    <span className="text-label-sm text-green-600">
                                        Active
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setCheckout({
                                                kind: "addon",
                                                moduleId: addon.id,
                                                label: addon.label,
                                                priceUsd: addon.priceUsd,
                                            })
                                        }
                                        className="h-9 shrink-0 rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 hover:bg-blue-600"
                                    >
                                        Enable
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
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
