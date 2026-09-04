"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import PageHeader from "@/components/Admin/PageHeader";
import QuotaBar from "@/components/Admin/QuotaBar";
import StatCard from "@/components/Admin/StatCard";
import StatusBadge from "@/components/Admin/StatusBadge";
import CheckoutModal from "@/components/Company/CheckoutModal";
import InvoiceDetailModal from "@/components/Billing/InvoiceDetailModal";
import { CompanyContentSkeleton } from "@/components/Skeleton/portals";
import { useAuth } from "@/context/AuthContext";
import { getPlanById, PLAN_ORDER } from "@/lib/admin/plans";
import type { Plan, PlanId } from "@/lib/admin/types";
import type { Invoice } from "@/lib/admin/billingTypes";
import { chargeUsdForTokens } from "@/lib/billing/tokenEconomics";
import {
    apiErrorMessage,
    cancelOrgSubscription,
    listPackages,
    previewPricing,
    readOrgTax,
    resumeOrgSubscription,
    type PricingPreview,
} from "@/lib/coair/commerce";
import {
    confirmPurchase,
    createPurchase,
    getOrgInvoice,
    listOrgInvoices,
    mapInvoice,
} from "@/lib/coair/ops";
import { downloadInvoicePdf } from "@/lib/admin/invoiceDocument";
import { useLiveOrg } from "@/lib/coair/useLiveOrg";

/** Default storage list price when the company enters a custom GB amount. */
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
    dateFormatter.format(
        new Date(date.length <= 10 ? `${date}T00:00:00` : date)
    );

const bytesToGb = (bytes?: number) =>
    Math.round(((bytes ?? 0) / 1024 ** 3) * 10) / 10;

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

const LiveCompanyBillingPage = () => {
    const { session } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = session?.accessToken ?? "";
    const { org, me, refresh, error: orgError, loading: orgLoading } =
        useLiveOrg();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [tokenAmountInput, setTokenAmountInput] = useState("5000");
    const [storageGbInput, setStorageGbInput] = useState("50");
    const [plans, setPlans] = useState<Plan[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [billingReady, setBillingReady] = useState(false);
    const [checkout, setCheckout] = useState<CheckoutState>(null);
    const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
    const [couponCode, setCouponCode] = useState("");
    const [pricing, setPricing] = useState<PricingPreview | null>(null);
    const [taxPercent, setTaxPercent] = useState(0);
    const confirming = useRef(false);
    const sessionId = searchParams.get("session_id");
    const cancelled = searchParams.get("cancelled") === "1";

    const loadInvoices = useCallback(async () => {
        if (!token) {
            setBillingReady(true);
            return;
        }
        try {
            const invoiceRows = await listOrgInvoices(token);
            setInvoices(invoiceRows);
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
        void readOrgTax(token)
            .then((tax) => setTaxPercent(Number(tax.percent) || 0))
            .catch(() => setTaxPercent(0));
    }, [token]);

    useEffect(() => {
        if (!checkout || !token) {
            setPricing(null);
            return;
        }
        const base =
            checkout.kind === "upgrade"
                ? checkout.priceUsd
                : checkout.priceUsd;
        let cancelledPreview = false;
        const handle = window.setTimeout(() => {
            void previewPricing(token, {
                amount_usd: base,
                coupon_code: couponCode,
            })
                .then((row) => {
                    if (!cancelledPreview) setPricing(row);
                })
                .catch(() => {
                    if (!cancelledPreview) setPricing(null);
                });
        }, 200);
        return () => {
            cancelledPreview = true;
            window.clearTimeout(handle);
        };
    }, [checkout, couponCode, token]);

    useEffect(() => {
        if (!checkout) setCouponCode("");
    }, [checkout]);

    const planId = org?.subscription?.plan_id as PlanId | undefined;
    const plan = planId
        ? getPlanById(planId, plans) ?? getPlanById(planId)
        : undefined;
    const currentPlanIndex = planId ? PLAN_ORDER.indexOf(planId) : -1;
    const autoRenew = Boolean(org?.subscription?.auto_renew);
    const cancelAtPeriodEnd = Boolean(org?.subscription?.cancel_at_period_end);
    const periodEnd = org?.subscription?.current_period_end
        ? formatDate(org.subscription.current_period_end)
        : null;
    const sellRate =
        org?.subscription?.sell_tokens_per_usd_override &&
        org.subscription.sell_tokens_per_usd_override > 0
            ? org.subscription.sell_tokens_per_usd_override
            : 80;
    const tokenLimit = me?.token_limit ?? 0;
    const tokensUsed = me?.used_tokens ?? 0;
    const storageLimitGb = bytesToGb(me?.storage_limit_bytes);
    const storageUsedGb = bytesToGb(me?.storage_used_bytes);

    const tokenAmount = Math.max(0, Math.floor(Number(tokenAmountInput) || 0));
    const tokenPriceUsd = chargeUsdForTokens(tokenAmount, sellRate);
    const storageGb = Math.max(0, Math.floor(Number(storageGbInput) || 0));
    const storagePriceUsd = storageGb * STORAGE_USD_PER_GB;

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
                    coupon_code: couponCode,
                });
                if (result.redirected) return { ok: true };
            } else if (checkout.kind === "storage") {
                const result = await createPurchase(token, {
                    kind: "storage",
                    amount_usd: checkout.priceUsd,
                    gb: checkout.gb,
                    description: checkout.label,
                    coupon_code: couponCode,
                });
                if (result.redirected) return { ok: true };
            } else if (checkout.kind === "upgrade") {
                const result = await createPurchase(token, {
                    kind: "upgrade",
                    amount_usd: checkout.priceUsd,
                    plan_id: checkout.planId,
                    description: `Upgrade to ${checkout.planName}`,
                    coupon_code: couponCode,
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
                : "";

    const checkoutSummary =
        checkout?.kind === "upgrade"
            ? `Switch your plan to ${checkout.planName}. You will pay securely via Stripe.`
            : checkout?.kind === "tokens"
              ? `Add ${checkout.label} to your company token pool.`
              : checkout?.kind === "storage"
                ? `Add ${checkout.label} to your company storage limit.`
                : "";

    const checkoutAmount = pricing
        ? currencyFormatter.format(pricing.total_usd)
        : checkout?.kind === "upgrade"
          ? checkout.priceLabel
          : checkout
            ? currencyFormatter.format(checkout.priceUsd)
            : "";

    const checkoutPricingNote = pricing
        ? [
              pricing.discount_usd > 0
                  ? `Coupon −${currencyFormatter.format(pricing.discount_usd)}`
                  : null,
              pricing.tax_usd > 0
                  ? `Includes ${pricing.tax_percent}% tax (${currencyFormatter.format(pricing.tax_usd)})`
                  : taxPercent > 0
                    ? `Tax ${taxPercent}% applied at checkout`
                    : null,
          ]
              .filter(Boolean)
              .join(" · ") || null
        : taxPercent > 0
          ? `Tax ${taxPercent}% applied at checkout`
          : null;

    return (
        <div className="page-stack">
            <PageHeader
                title="Billing"
                description="Invoices, token and storage purchases, and auto-renewing plans. Token pool resets when the package renews."
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
                        label="Auto-renew"
                        value={
                            cancelAtPeriodEnd
                                ? "Cancelling"
                                : autoRenew
                                  ? "On"
                                  : "Off"
                        }
                        hint={
                            periodEnd
                                ? cancelAtPeriodEnd
                                    ? `Ends ${periodEnd}`
                                    : `Next renewal ${periodEnd}`
                                : "Monthly subscription"
                        }
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
                {planId && planId !== "demo" ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                        {cancelAtPeriodEnd ? (
                            <button
                                type="button"
                                className="h-10 rounded-full bg-blue-500 px-4 text-label-sm text-white-0"
                                onClick={() =>
                                    void resumeOrgSubscription(token)
                                        .then(async () => {
                                            setError(null);
                                            await refresh();
                                        })
                                        .catch((err) =>
                                            setError(apiErrorMessage(err))
                                        )
                                }
                            >
                                Resume auto-renew
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="h-10 rounded-full border border-stroke-soft-200 px-4 text-label-sm text-red-500"
                                onClick={() => {
                                    if (
                                        !window.confirm(
                                            "Cancel auto-renew? You keep this package until the current period ends. Token pool will not renew after that."
                                        )
                                    ) {
                                        return;
                                    }
                                    void cancelOrgSubscription(token)
                                        .then(async () => {
                                            setError(null);
                                            await refresh();
                                        })
                                        .catch((err) =>
                                            setError(apiErrorMessage(err))
                                        );
                                }}
                            >
                                Cancel package
                            </button>
                        )}
                    </div>
                ) : null}
            </section>

            <section className="surface-panel overflow-hidden">
                <div className="surface-panel-header">
                    <h2 className="text-label-lg text-strong-950">Invoices</h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Billing history for your company.
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="surface-table w-full min-w-[720px] text-left">
                        <thead>
                            <tr>
                                <th>Invoice</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Issued</th>
                                <th>Due</th>
                                <th>Actions</th>
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
                                    <td>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setViewInvoice(invoice);
                                                    if (!token) return;
                                                    void getOrgInvoice(
                                                        token,
                                                        invoice.id
                                                    )
                                                        .then(setViewInvoice)
                                                        .catch(() => undefined);
                                                }}
                                                className="h-8 rounded-lg border border-stroke-soft-200 px-3 text-label-xs text-strong-950 hover:bg-weak-50"
                                            >
                                                View
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    downloadInvoicePdf(
                                                        invoice,
                                                        org?.org?.name
                                                    )
                                                }
                                                className="h-8 rounded-lg bg-blue-500 px-3 text-label-xs text-white-0 hover:bg-blue-600"
                                            >
                                                Download
                                            </button>
                                        </div>
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
                            placeholder="e.g. 8000"
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
                        Buy with Stripe
                    </button>
                </section>

                <section className="surface-panel p-5">
                    <h2 className="text-label-lg text-strong-950">
                        Extra storage
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Enter how much storage you need. Listed at $
                        {STORAGE_USD_PER_GB}/GB.
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
                            placeholder="e.g. 75"
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
                        Buy with Stripe
                    </button>
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

            <CheckoutModal
                open={checkout !== null}
                onClose={() => setCheckout(null)}
                title={checkoutTitle}
                summary={checkoutSummary}
                amountLabel={checkoutAmount}
                pricingNote={checkoutPricingNote}
                couponCode={couponCode}
                onCouponCodeChange={setCouponCode}
                onConfirm={handleConfirm}
            />
            <InvoiceDetailModal
                invoice={viewInvoice}
                companyName={org?.org?.name}
                onClose={() => setViewInvoice(null)}
            />
        </div>
    );
};

export default LiveCompanyBillingPage;
