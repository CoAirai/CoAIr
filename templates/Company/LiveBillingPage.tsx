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
import type { Plan, PlanId } from "@/lib/admin/types";
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
    const { org, me, users, refresh, error: orgError, loading: orgLoading } =
        useLiveOrg();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [topupRequests, setTopupRequests] = useState<TopUpRequest[]>([]);
    const [topupsEnabled, setTopupsEnabled] = useState(false);
    const [tokenAmountInput, setTokenAmountInput] = useState("5000");
    const [tokenNote, setTokenNote] = useState("");
    const [storageGbInput, setStorageGbInput] = useState("50");
    const [customRequirement, setCustomRequirement] = useState("");
    const [customBudgetInput, setCustomBudgetInput] = useState("");
    const [customSubmitting, setCustomSubmitting] = useState(false);
    const [tokenRequesting, setTokenRequesting] = useState(false);
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

    const tokenAmount = Math.max(0, Math.floor(Number(tokenAmountInput) || 0));
    const tokenPriceUsd = chargeUsdForTokens(tokenAmount, sellRate);
    const storageGb = Math.max(0, Math.floor(Number(storageGbInput) || 0));
    const storagePriceUsd = storageGb * STORAGE_USD_PER_GB;
    const customBudgetUsd = Math.max(0, Number(customBudgetInput) || 0);

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
            }
            await Promise.all([loadInvoices(), refresh()]);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: apiErrorMessage(err) };
        }
    };

    const requestTokenTopup = async () => {
        if (tokenAmount < 1) {
            setError("Enter how many tokens you need.");
            return;
        }
        setTokenRequesting(true);
        try {
            await createOrgTopup(token, {
                tokens: tokenAmount,
                amountUsd: tokenPriceUsd,
                reason:
                    tokenNote.trim() ||
                    `Request ${numberFormatter.format(tokenAmount)} tokens`,
            });
            setError(null);
            await loadInvoices();
        } catch (err) {
            setError(apiErrorMessage(err));
        } finally {
            setTokenRequesting(false);
        }
    };

    const submitCustomRequest = async () => {
        const requirement = customRequirement.trim();
        if (requirement.length < 3) {
            setError("Describe what you need for the custom purchase request.");
            return;
        }
        setCustomSubmitting(true);
        try {
            const estimatedTokens =
                customBudgetUsd > 0
                    ? Math.max(1, Math.round(customBudgetUsd * sellRate))
                    : 1;
            await createOrgTopup(token, {
                tokens: estimatedTokens,
                amountUsd: customBudgetUsd,
                reason: requirement,
            });
            setCustomRequirement("");
            setCustomBudgetInput("");
            setError(null);
            await loadInvoices();
        } catch (err) {
            setError(apiErrorMessage(err));
        } finally {
            setCustomSubmitting(false);
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
                description="Invoices, custom token and storage purchases, plan upgrades, and custom requests."
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

            <div className="grid gap-6 xl:grid-cols-2">
                <section className="surface-panel p-5">
                    <h2 className="text-label-lg text-strong-950">
                        Extra tokens
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Enter the tokens you need. Priced at {sellRate} tokens
                        per $1. Pay with Stripe, or request Super Admin approval
                        when top-ups are enabled.
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
                    <label className="mt-3 block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Note (optional)
                        </span>
                        <input
                            value={tokenNote}
                            onChange={(event) => setTokenNote(event.target.value)}
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                            placeholder="Why you need more tokens"
                        />
                    </label>
                    <p className="mt-3 text-label-sm text-strong-950">
                        Estimated:{" "}
                        {tokenAmount > 0
                            ? currencyFormatter.format(tokenPriceUsd)
                            : "—"}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
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
                            className="h-9 rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 hover:bg-blue-600 disabled:opacity-50"
                        >
                            Buy with Stripe
                        </button>
                        <button
                            type="button"
                            disabled={
                                !topupsEnabled ||
                                tokenAmount < 1 ||
                                tokenRequesting
                            }
                            onClick={() => void requestTokenTopup()}
                            className="h-9 rounded-xl border border-stroke-soft-200 px-4 text-label-sm text-strong-950 hover:bg-weak-50 disabled:opacity-50"
                        >
                            {tokenRequesting
                                ? "Requesting…"
                                : "Request approval"}
                        </button>
                    </div>
                    {!topupsEnabled ? (
                        <p className="mt-2 text-label-xs text-sub-600">
                            Approval requests are off. You can still buy with
                            Stripe, or ask Super Admin to enable top-ups.
                        </p>
                    ) : null}
                    {topupRequests.length > 0 ? (
                        <p className="mt-3 text-label-xs text-sub-600">
                            Latest request: {topupRequests[0].status} ·{" "}
                            {numberFormatter.format(
                                topupRequests[0].tokensRequested
                            )}{" "}
                            tokens
                        </p>
                    ) : null}
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

            <section className="surface-panel p-5">
                <h2 className="text-label-lg text-strong-950">
                    Custom purchase request
                </h2>
                <p className="mt-1 text-label-xs text-sub-600">
                    Chat, Chronology, and Forensic modules are included with your
                    package. Use this for anything else you need — Super Admin
                    reviews the request.
                </p>
                <label className="mt-4 block">
                    <span className="mb-1.5 block text-label-xs text-sub-600">
                        What do you need?
                    </span>
                    <textarea
                        value={customRequirement}
                        onChange={(event) =>
                            setCustomRequirement(event.target.value)
                        }
                        rows={4}
                        className="w-full rounded-xl border border-stroke-soft-200 px-3 py-2 text-label-sm outline-none focus:border-blue-500"
                        placeholder="Describe the purchase or capacity you need…"
                    />
                </label>
                <label className="mt-3 block max-w-xs">
                    <span className="mb-1.5 block text-label-xs text-sub-600">
                        Estimated budget (USD, optional)
                    </span>
                    <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={customBudgetInput}
                        onChange={(event) =>
                            setCustomBudgetInput(event.target.value)
                        }
                        className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        placeholder="0.00"
                    />
                </label>
                <button
                    type="button"
                    disabled={!topupsEnabled || customSubmitting}
                    onClick={() => void submitCustomRequest()}
                    className="mt-4 h-9 rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 hover:bg-blue-600 disabled:opacity-50"
                >
                    {customSubmitting ? "Submitting…" : "Submit request"}
                </button>
                {!topupsEnabled ? (
                    <p className="mt-2 text-label-xs text-sub-600">
                        Custom requests require the platform top-ups flag. Ask
                        Super Admin to enable it, or open a ticket.
                    </p>
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

export default LiveCompanyBillingPage;
