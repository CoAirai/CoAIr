"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import PageHeader from "@/components/Admin/PageHeader";
import QuotaBar from "@/components/Admin/QuotaBar";
import StatCard from "@/components/Admin/StatCard";
import StatusBadge from "@/components/Admin/StatusBadge";
import CheckoutModal from "@/components/Company/CheckoutModal";
import { CompanyContentSkeleton } from "@/components/Skeleton/portals";
import { useAuth } from "@/context/AuthContext";
import { getPlanById, PLAN_ORDER } from "@/lib/admin/plans";
import type { ModuleId, Plan, PlanId } from "@/lib/admin/types";
import type { Invoice, TopUpRequest } from "@/lib/admin/billingTypes";
import { chargeUsdForTokens } from "@/lib/billing/tokenEconomics";
import { apiErrorMessage, listPackages } from "@/lib/coair/commerce";
import {
    confirmPurchase,
    createPurchase,
    createOrgTopup,
    listOrgInvoices,
    listOrgTopups,
    mapInvoice,
    readPlatformStatus,
} from "@/lib/coair/ops";
import { useLiveOrg } from "@/lib/coair/useLiveOrg";

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
    dateFormatter.format(
        new Date(date.length <= 10 ? `${date}T00:00:00` : date)
    );

const bytesToGb = (bytes?: number) =>
    Math.round(((bytes ?? 0) / 1024 ** 3) * 10) / 10;

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
          priceUsd: number;
      }
    | {
          kind: "addon";
          moduleId: ModuleId;
          label: string;
          priceUsd: number;
      }
    | null;

const LiveCompanyBillingPage = () => {
    const { session } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = session?.accessToken ?? "";
    const { org, me, users, refresh, error: orgError, loading: orgLoading } =
        useLiveOrg();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [topupRequests, setTopupRequests] = useState<TopUpRequest[]>([]);
    const [topupsEnabled, setTopupsEnabled] = useState(false);
    const [topupReason, setTopupReason] = useState("Need additional tokens");
    const [plans, setPlans] = useState<Plan[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [billingReady, setBillingReady] = useState(false);
    const [checkout, setCheckout] = useState<CheckoutState>(null);
    const confirming = useRef(false);
    const sessionId = searchParams.get("session_id");
    const cancelled = searchParams.get("cancelled") === "1";

    const loadInvoices = useCallback(async () => {
        if (!token) {
            setBillingReady(true);
            return;
        }
        try {
            const [invoiceRows, requestRows, status] = await Promise.all([
                listOrgInvoices(token),
                listOrgTopups(token).catch(() => []),
                readPlatformStatus(token).catch(() => null),
            ]);
            setInvoices(invoiceRows);
            setTopupRequests(requestRows);
            setTopupsEnabled(Boolean(status?.flags?.topups));
            setError(null);
        } catch (err) {
            setError(apiErrorMessage(err));
        } finally {
            setBillingReady(true);
        }
    }, [token]);

    useEffect(() => {
        void loadInvoices();
    }, [loadInvoices]);

    useEffect(() => {
        if (!token || !sessionId || confirming.current) return;
        confirming.current = true;
        void confirmPurchase(token, sessionId)
            .then(async (invoice) => {
                setInvoices((prev) => {
                    const mapped = mapInvoice(invoice);
                    if (prev.some((row) => row.id === mapped.id)) return prev;
                    return [mapped, ...prev];
                });
                await Promise.all([loadInvoices(), refresh()]);
                setError(null);
                router.replace("/company/billing");
            })
            .catch((err) => {
                confirming.current = false;
                setError(apiErrorMessage(err));
            });
    }, [token, sessionId, loadInvoices, refresh, router]);

    useEffect(() => {
        if (!token) return;
        void listPackages(token)
            .then(setPlans)
            .catch((err) => setError(apiErrorMessage(err)));
    }, [token]);

    const planId = org?.subscription?.plan_id as PlanId | undefined;
    const plan = planId
        ? getPlanById(planId, plans) ?? getPlanById(planId)
        : undefined;
    const currentPlanIndex = planId ? PLAN_ORDER.indexOf(planId) : -1;
    const sellRate =
        org?.subscription?.sell_tokens_per_usd_override &&
        org.subscription.sell_tokens_per_usd_override > 0
            ? org.subscription.sell_tokens_per_usd_override
            : 80;
    const tokenLimit = me?.token_limit ?? 0;
    const tokensUsed = me?.used_tokens ?? 0;
    const storageLimitGb = bytesToGb(me?.storage_limit_bytes);
    const storageUsedGb = bytesToGb(me?.storage_used_bytes);

    const tokenPacks = useMemo(
        () =>
            TOKEN_AMOUNTS.map((amount) => ({
                amount,
                priceUsd: chargeUsdForTokens(amount, sellRate),
                label: `${amount.toLocaleString()} tokens`,
            })),
        [sellRate]
    );

    const upgradePlans = useMemo(
        () =>
            (plans.length ? plans : []).filter(
                (entry) => PLAN_ORDER.indexOf(entry.id) > currentPlanIndex
            ),
        [plans, currentPlanIndex]
    );

    if (orgLoading || !billingReady) {
        return <CompanyContentSkeleton />;
    }

    const handleConfirm = async () => {
        if (!checkout) return { ok: false, error: "No purchase selected" };
        try {
            if (checkout.kind === "tokens") {
                const result = await createPurchase(token, {
                    kind: "tokens",
                    amount_usd: checkout.priceUsd,
                    tokens: checkout.amount,
                    description: checkout.label,
                });
                if (result.redirected) return { ok: true };
            } else if (checkout.kind === "storage") {
                const result = await createPurchase(token, {
                    kind: "storage",
                    amount_usd: checkout.priceUsd,
                    gb: checkout.gb,
                    description: checkout.label,
                });
                if (result.redirected) return { ok: true };
            } else if (checkout.kind === "upgrade") {
                const result = await createPurchase(token, {
                    kind: "upgrade",
                    amount_usd: checkout.priceUsd,
                    plan_id: checkout.planId,
                    description: `Upgrade to ${checkout.planName}`,
                });
                if (result.redirected) return { ok: true };
            } else {
                const result = await createPurchase(token, {
                    kind: "addon",
                    amount_usd: checkout.priceUsd,
                    module_id: checkout.moduleId,
                    description: checkout.label,
                });
                if (result.redirected) return { ok: true };
            }
            await Promise.all([loadInvoices(), refresh()]);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: apiErrorMessage(err) };
        }
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
            ? `Switch your plan to ${checkout.planName}. You will pay securely via Stripe.`
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
        <div className="page-stack">
            <PageHeader
                title="Billing"
                description="Live invoices and Stripe Checkout for upgrades, storage, and token packs."
            />
            {cancelled ? (
                <p className="text-label-sm text-amber-600">
                    Checkout was cancelled. No charge was made.
                </p>
            ) : null}
            {orgError || error ? (
                <p className="text-label-sm text-red-500">
                    {error ?? orgError}
                </p>
            ) : null}

            <section className="surface-panel p-5">
                <h2 className="text-label-lg text-strong-950">Current plan</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        label="Plan"
                        value={plan?.name ?? planId ?? "—"}
                        hint={plan?.priceLabel ?? "—"}
                    />
                    <StatCard
                        label="Token limit"
                        value={numberFormatter.format(tokenLimit)}
                        hint={`${numberFormatter.format(tokensUsed)} used`}
                    />
                    <StatCard
                        label="Storage limit"
                        value={`${numberFormatter.format(storageLimitGb)} GB`}
                        hint={`${numberFormatter.format(storageUsedGb)} GB used`}
                    />
                    <StatCard
                        label="Team size"
                        value={numberFormatter.format(
                            org?.counts?.members ?? users.length
                        )}
                        hint="Active seats on plan"
                    />
                </div>
                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                    <QuotaBar
                        label="Tokens"
                        used={tokensUsed}
                        limit={tokenLimit || 1}
                    />
                    <QuotaBar
                        label="Storage"
                        used={storageUsedGb}
                        limit={storageLimitGb || 1}
                        unit="GB"
                    />
                </div>
            </section>

            <section className="surface-panel overflow-hidden">
                <div className="surface-panel-header">
                    <h2 className="text-label-lg text-strong-950">Invoices</h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Billing history for your company.
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
                                    <td className="text-strong-950">{invoice.id}</td>
                                    <td className="tabular-nums text-sub-600">
                                        {currencyFormatter.format(invoice.amountUsd)}
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
                {invoices.length === 0 ? (
                    <p className="px-5 py-12 text-center text-label-sm text-sub-600">
                        No invoices yet.
                    </p>
                ) : null}
            </section>

            <section className="surface-panel p-5">
                <h2 className="text-label-lg text-strong-950">
                    Request a token top-up
                </h2>
                <p className="mt-1 text-label-xs text-sub-600">
                    {topupsEnabled
                        ? "Super Admin reviews these before credits are applied."
                        : "Token top-up requests are turned off. Ask Super Admin to enable the topups flag."}
                </p>
                <div className="mt-4 space-y-3">
                    {tokenPacks.map((pack) => (
                        <div
                            key={`request-${pack.amount}`}
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
                                disabled={!topupsEnabled}
                                onClick={() =>
                                    void createOrgTopup(token, {
                                        tokens: pack.amount,
                                        amountUsd: pack.priceUsd,
                                        reason: topupReason.trim() || "Need additional tokens",
                                    })
                                        .then(() => loadInvoices())
                                        .catch((err) =>
                                            setError(apiErrorMessage(err))
                                        )
                                }
                                className="h-9 shrink-0 rounded-xl border border-stroke-soft-200 px-4 text-label-sm text-strong-950 hover:bg-weak-50 disabled:opacity-50"
                            >
                                Request
                            </button>
                        </div>
                    ))}
                </div>
                <input
                    value={topupReason}
                    onChange={(event) => setTopupReason(event.target.value)}
                    className="mt-4 h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                    placeholder="Reason for Super Admin"
                />
                {topupRequests.length > 0 ? (
                    <p className="mt-3 text-label-xs text-sub-600">
                        Latest: {topupRequests[0].status} ·{" "}
                        {numberFormatter.format(topupRequests[0].tokensRequested)}{" "}
                        tokens
                    </p>
                ) : null}
            </section>

            <div className="grid gap-6 xl:grid-cols-2">
                <section className="surface-panel p-5">
                    <h2 className="text-label-lg text-strong-950">
                        Buy extra tokens
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Priced at {sellRate} tokens per $1.
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
                                        setCheckout({ kind: "tokens", ...pack })
                                    }
                                    className="h-9 shrink-0 rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 hover:bg-blue-600"
                                >
                                    Buy
                                </button>
                            </div>
                        ))}
                    </div>
                </section>
                <section className="surface-panel p-5">
                    <h2 className="text-label-lg text-strong-950">
                        Buy extra storage
                    </h2>
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
                                        setCheckout({ kind: "storage", ...pack })
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

            <section className="surface-panel p-5">
                <h2 className="text-label-lg text-strong-950">Upgrade plan</h2>
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
                                        {target.priceLabel} · {target.usersIncluded}{" "}
                                        seats · ${target.apiCreditsUsd} credits
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
                <h2 className="text-label-lg text-strong-950">Module add-ons</h2>
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
                    ).map((addon) => (
                        <div
                            key={addon.id}
                            className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-stroke-soft-200 px-4 py-3"
                        >
                            <div>
                                <p className="text-label-sm text-strong-950">
                                    {addon.label}
                                </p>
                                <p className="text-label-xs text-sub-600">
                                    {currencyFormatter.format(addon.priceUsd)} /
                                    month
                                </p>
                            </div>
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
                        </div>
                    ))}
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

export default LiveCompanyBillingPage;
