"use client";

import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from "react";

import StatCard from "@/components/Admin/StatCard";
import StatusBadge from "@/components/Admin/StatusBadge";
import InvoiceDetailModal from "@/components/Billing/InvoiceDetailModal";
import { useAuth } from "@/context/AuthContext";
import { filterInvoices, getBillingStats } from "@/lib/admin/billingSelectors";
import type { Invoice, InvoiceStatus } from "@/lib/admin/billingTypes";
import { downloadInvoicePdf } from "@/lib/admin/invoiceDocument";
import type { Coupon, CouponDiscountType } from "@/lib/admin/wave2Types";
import { apiErrorMessage } from "@/lib/coair/commerce";
import {
    createAdminInvoice,
    createCoupon,
    getAdminInvoice,
    listAdminInvoices,
    listCoupons,
    readTax,
    refundInvoice,
    retryInvoice,
    toggleCoupon,
    writeTax,
} from "@/lib/coair/ops";
import {
    listAdminSubscriptions,
    type CoairOrgSubscription,
} from "@/lib/coair/admin";
import { planLabel } from "@/lib/admin/liveHelpers";
import { useLiveAdmin } from "@/lib/coair/useLiveAdmin";
import Link from "next/link";

const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
});
const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
});

const formatDate = (date: string) =>
    dateFormatter.format(
        new Date(date.length <= 10 ? `${date}T00:00:00` : date)
    );

const LiveBillingPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const { orgs } = useLiveAdmin();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [subscriptions, setSubscriptions] = useState<CoairOrgSubscription[]>(
        []
    );
    const [invoicesReady, setInvoicesReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState<InvoiceStatus | "all">("all");
    const [refundTargetId, setRefundTargetId] = useState<string | null>(null);
    const [refundReason, setRefundReason] = useState("");
    const [couponCode, setCouponCode] = useState("");
    const [couponType, setCouponType] = useState<CouponDiscountType>("percent");
    const [couponValue, setCouponValue] = useState("10");
    const [couponError, setCouponError] = useState<string | null>(null);
    const [couponSuccess, setCouponSuccess] = useState<string | null>(null);
    const [taxPercent, setTaxPercent] = useState("5");
    const [taxRegion, setTaxRegion] = useState("Default");
    const [taxSaved, setTaxSaved] = useState(false);
    const [invoiceOrgId, setInvoiceOrgId] = useState("");
    const [invoiceAmount, setInvoiceAmount] = useState("100");
    const [invoiceDescription, setInvoiceDescription] = useState("");
    const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);

    const refresh = useCallback(async () => {
        if (!token) {
            setInvoices([]);
            setCoupons([]);
            setSubscriptions([]);
            setInvoicesReady(true);
            return;
        }
        try {
            const [invoiceRows, couponRows, tax, subscriptionRows] =
                await Promise.all([
                    listAdminInvoices(token),
                    listCoupons(token),
                    readTax(token),
                    listAdminSubscriptions(token),
                ]);
            setInvoices(invoiceRows);
            setCoupons(couponRows);
            setSubscriptions(subscriptionRows.subscriptions ?? []);
            setTaxPercent(String(tax.percent));
            setTaxRegion(tax.regionLabel);
            setError(null);
        } catch (err) {
            setError(apiErrorMessage(err));
        } finally {
            setInvoicesReady(true);
        }
    }, [token]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const companyNameById = useMemo(
        () =>
            Object.fromEntries(orgs.map((org) => [org.org_id, org.name])),
        [orgs]
    );

    const billingStats = useMemo(() => {
        const paidThisMonth = invoices
            .filter((invoice) => invoice.status === "paid")
            .map((invoice) => ({
                id: invoice.id,
                companyId: invoice.companyId,
                amountUsd: invoice.amountUsd,
                method: "card" as const,
                last4: "0000",
                status: "succeeded" as const,
                paidAt: invoice.issuedAt,
            }));
        const stats = getBillingStats(invoices, paidThisMonth);
        return { ...stats, mrrUsd: stats.paidThisMonthUsd };
    }, [invoices]);

    const filteredInvoices = useMemo(
        () =>
            filterInvoices(invoices, {
                search,
                status,
                companyNameById,
            }),
        [invoices, search, status, companyNameById]
    );

    const onRetry = async (invoiceId: string) => {
        try {
            await retryInvoice(token, invoiceId);
            await refresh();
        } catch (err) {
            setError(apiErrorMessage(err));
        }
    };

    const confirmRefund = async (invoiceId: string) => {
        try {
            await refundInvoice(token, invoiceId, refundReason.trim());
            setRefundTargetId(null);
            setRefundReason("");
            await refresh();
        } catch (err) {
            setError(apiErrorMessage(err));
        }
    };

    const onCreateCoupon = async (event: FormEvent) => {
        event.preventDefault();
        try {
            await createCoupon(token, {
                code: couponCode,
                discountType: couponType,
                discountValue: Number(couponValue),
            });
            setCouponError(null);
            setCouponSuccess(`Coupon ${couponCode.trim().toUpperCase()} created`);
            setCouponCode("");
            setCouponType("percent");
            setCouponValue("10");
            await refresh();
        } catch (err) {
            setCouponSuccess(null);
            setCouponError(apiErrorMessage(err));
        }
    };

    const onToggleCoupon = async (couponId: string) => {
        try {
            await toggleCoupon(token, couponId);
            await refresh();
        } catch (err) {
            setError(apiErrorMessage(err));
        }
    };

    const onSaveTax = async (event: FormEvent) => {
        event.preventDefault();
        const percent = Number(taxPercent);
        if (!Number.isFinite(percent) || percent < 0) return;
        try {
            await writeTax(token, {
                percent,
                regionLabel: taxRegion.trim() || "Default",
            });
            setTaxSaved(true);
            await refresh();
        } catch (err) {
            setError(apiErrorMessage(err));
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Billing</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Live invoices, coupons, and tax settings from the API.
                    Coupons and tax apply on company Stripe checkout and
                    purchases.
                </p>
            </div>
            {error ? (
                <p className="text-label-sm text-red-500">{error}</p>
            ) : null}

            <form
                onSubmit={async (event: FormEvent) => {
                    event.preventDefault();
                    try {
                        await createAdminInvoice(token, {
                            org_id: invoiceOrgId,
                            amount_usd: Number(invoiceAmount),
                            description: invoiceDescription,
                        });
                        setInvoiceDescription("");
                        await refresh();
                    } catch (err) {
                        setError(apiErrorMessage(err));
                    }
                }}
                className="grid gap-3 rounded-2xl border border-stroke-soft-200 bg-white-0 p-5 md:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)_auto]"
            >
                <select
                    required
                    value={invoiceOrgId}
                    onChange={(event) => setInvoiceOrgId(event.target.value)}
                    className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                >
                    <option value="">Company</option>
                    {orgs.map((org) => (
                        <option key={org.org_id} value={org.org_id}>
                            {org.name}
                        </option>
                    ))}
                </select>
                <input
                    required
                    type="number"
                    min={1}
                    value={invoiceAmount}
                    onChange={(event) => setInvoiceAmount(event.target.value)}
                    className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                />
                <input
                    value={invoiceDescription}
                    onChange={(event) =>
                        setInvoiceDescription(event.target.value)
                    }
                    placeholder="Description"
                    className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                />
                <button
                    type="submit"
                    className="h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0"
                >
                    Create invoice
                </button>
            </form>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="Active packages"
                    value={String(
                        subscriptions.filter(
                            (sub) =>
                                (sub.status || "active") === "active" &&
                                !sub.needs_checkout
                        ).length
                    )}
                    hint="Companies with active subscriptions"
                />
                <StatCard
                    label="Outstanding"
                    value={currencyFormatter.format(billingStats.outstandingUsd)}
                    hint="Open and past-due invoices"
                />
                <StatCard
                    label="Paid this month"
                    value={currencyFormatter.format(billingStats.paidThisMonthUsd)}
                    hint="Paid invoices this month"
                />
                <StatCard
                    label="Past due"
                    value={invoices
                        .filter((invoice) => invoice.status === "past_due")
                        .length.toString()}
                    hint="Invoices requiring attention"
                />
            </div>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 p-5">
                    <h2 className="text-label-lg text-strong-950">
                        Company packages
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Live subscription status from company billing (auto-renew,
                        cancel at period end).
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">Company</th>
                                <th className="px-5 py-3 font-medium">Plan</th>
                                <th className="px-5 py-3 font-medium">Status</th>
                                <th className="px-5 py-3 font-medium">
                                    Auto-renew
                                </th>
                                <th className="px-5 py-3 font-medium">
                                    Period end
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {subscriptions.map((sub) => (
                                <tr
                                    key={sub.org_id || sub.plan_id}
                                    className="text-label-sm"
                                >
                                    <td className="px-5 py-4">
                                        {sub.org_id ? (
                                            <Link
                                                href={`/admin/companies/${sub.org_id}?tab=billing`}
                                                className="text-strong-950 hover:text-blue-500"
                                            >
                                                {sub.org_name || sub.org_id}
                                            </Link>
                                        ) : (
                                            "—"
                                        )}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {planLabel(sub.plan_id)}
                                    </td>
                                    <td className="px-5 py-4">
                                        <StatusBadge
                                            status={sub.status || "active"}
                                        />
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {sub.auto_renew
                                            ? "On"
                                            : sub.cancel_at_period_end
                                              ? "Cancels at period end"
                                              : "Off"}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {sub.current_period_end
                                            ? formatDate(sub.current_period_end)
                                            : "—"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {invoicesReady && subscriptions.length === 0 ? (
                    <p className="px-5 py-12 text-center text-label-sm text-sub-600">
                        No company packages yet.
                    </p>
                ) : null}
            </section>

            <form
                onSubmit={(event) => void onSaveTax(event)}
                className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5"
            >
                <h2 className="text-label-lg text-strong-950">Tax settings</h2>
                <p className="mt-1 text-label-xs text-sub-600">
                    Applies to new invoices generated after saving.
                </p>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                    <label className="block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Tax percent
                        </span>
                        <input
                            type="number"
                            min={0}
                            step="0.1"
                            value={taxPercent}
                            onChange={(event) => {
                                setTaxPercent(event.target.value);
                                setTaxSaved(false);
                            }}
                            className="h-10 w-32 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Region
                        </span>
                        <input
                            value={taxRegion}
                            onChange={(event) => {
                                setTaxRegion(event.target.value);
                                setTaxSaved(false);
                            }}
                            placeholder="e.g. US, EU"
                            className="h-10 w-48 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        />
                    </label>
                    <button
                        type="submit"
                        className="h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0 hover:opacity-90"
                    >
                        Save
                    </button>
                    {taxSaved ? (
                        <p className="text-label-sm text-green-600">
                            Tax settings updated
                        </p>
                    ) : null}
                </div>
            </form>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 p-5">
                    <h2 className="text-label-lg text-strong-950">Invoices</h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Retry past-due payments and issue refunds.
                    </p>
                </div>
                <div className="grid gap-3 border-b border-stroke-soft-200 p-5 md:grid-cols-[minmax(240px,1fr)_200px]">
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search by company name"
                        className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                    />
                    <select
                        value={status}
                        onChange={(event) =>
                            setStatus(event.target.value as InvoiceStatus | "all")
                        }
                        className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                    >
                        <option value="all">All statuses</option>
                        <option value="paid">Paid</option>
                        <option value="open">Open</option>
                        <option value="past_due">Past due</option>
                        <option value="refunded">Refunded</option>
                    </select>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[960px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">Invoice</th>
                                <th className="px-5 py-3 font-medium">Company</th>
                                <th className="px-5 py-3 font-medium">Amount</th>
                                <th className="px-5 py-3 font-medium">Status</th>
                                <th className="px-5 py-3 font-medium">Issued</th>
                                <th className="px-5 py-3 font-medium">Due</th>
                                <th className="px-5 py-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {filteredInvoices.map((invoice) => (
                                <Fragment key={invoice.id}>
                                    <tr className="text-label-sm">
                                        <td className="px-5 py-4 text-strong-950">
                                            {invoice.id}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {companyNameById[invoice.companyId] ??
                                                invoice.companyId}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {currencyFormatter.format(invoice.amountUsd)}
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
                                        <td className="px-5 py-4">
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setViewInvoice(invoice);
                                                        if (!token) return;
                                                        void getAdminInvoice(
                                                            token,
                                                            invoice.id
                                                        )
                                                            .then(setViewInvoice)
                                                            .catch(() => undefined);
                                                    }}
                                                    className="h-9 rounded-xl border border-stroke-soft-200 px-3 text-label-sm text-strong-950 hover:bg-weak-50"
                                                >
                                                    View
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        downloadInvoicePdf(
                                                            invoice,
                                                            companyNameById[
                                                                invoice.companyId
                                                            ]
                                                        )
                                                    }
                                                    className="h-9 rounded-xl bg-blue-500 px-3 text-label-sm text-white-0 hover:bg-blue-600"
                                                >
                                                    Download
                                                </button>
                                                {invoice.status === "past_due" ? (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            void onRetry(invoice.id)
                                                        }
                                                        className="h-9 rounded-xl bg-blue-500 px-3 text-label-sm text-white-0 hover:bg-blue-600"
                                                    >
                                                        Retry
                                                    </button>
                                                ) : null}
                                                {invoice.status === "paid" ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setRefundTargetId(invoice.id);
                                                            setRefundReason("");
                                                        }}
                                                        className="h-9 rounded-xl border border-stroke-soft-200 px-3 text-label-sm text-strong-950 hover:bg-weak-50"
                                                    >
                                                        Refund
                                                    </button>
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                    {refundTargetId === invoice.id ? (
                                        <tr>
                                            <td
                                                colSpan={7}
                                                className="bg-weak-50 px-5 py-4"
                                            >
                                                <div className="flex flex-wrap items-end gap-3">
                                                    <input
                                                        autoFocus
                                                        value={refundReason}
                                                        onChange={(event) =>
                                                            setRefundReason(
                                                                event.target.value
                                                            )
                                                        }
                                                        placeholder="Customer requested refund"
                                                        className="h-10 min-w-[240px] flex-1 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                                                    />
                                                    <button
                                                        type="button"
                                                        disabled={!refundReason.trim()}
                                                        onClick={() =>
                                                            void confirmRefund(invoice.id)
                                                        }
                                                        className="h-10 rounded-xl bg-red-500 px-3 text-label-sm text-white-0 hover:bg-red-600 disabled:opacity-50"
                                                    >
                                                        Confirm refund
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setRefundTargetId(null);
                                                            setRefundReason("");
                                                        }}
                                                        className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : null}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
                {filteredInvoices.length === 0 ? (
                    <p className="px-5 py-12 text-center text-label-sm text-sub-600">
                        No invoices found
                    </p>
                ) : null}
                <div className="border-t border-stroke-soft-200 px-5 py-3 text-label-xs text-sub-600">
                    Showing {filteredInvoices.length} of {invoices.length} invoices
                </div>
            </section>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 p-5">
                    <h2 className="text-label-lg text-strong-950">Coupons</h2>
                </div>
                <form
                    onSubmit={(event) => void onCreateCoupon(event)}
                    className="grid gap-3 border-b border-stroke-soft-200 p-5 md:grid-cols-[minmax(160px,1fr)_160px_160px_auto]"
                >
                    <input
                        required
                        value={couponCode}
                        onChange={(event) => setCouponCode(event.target.value)}
                        placeholder="SAVE20"
                        className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                    />
                    <select
                        value={couponType}
                        onChange={(event) =>
                            setCouponType(event.target.value as CouponDiscountType)
                        }
                        className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                    >
                        <option value="percent">Percent</option>
                        <option value="fixed">Fixed ($)</option>
                    </select>
                    <input
                        type="number"
                        min={1}
                        value={couponValue}
                        onChange={(event) => setCouponValue(event.target.value)}
                        className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                    />
                    <button
                        type="submit"
                        className="h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0"
                    >
                        Create coupon
                    </button>
                    {couponError ? (
                        <p className="text-label-xs text-red-500 md:col-span-4">
                            {couponError}
                        </p>
                    ) : null}
                    {couponSuccess ? (
                        <p className="text-label-xs text-green-600 md:col-span-4">
                            {couponSuccess}
                        </p>
                    ) : null}
                </form>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">Code</th>
                                <th className="px-5 py-3 font-medium">Discount</th>
                                <th className="px-5 py-3 font-medium">Status</th>
                                <th className="px-5 py-3 font-medium">Created</th>
                                <th className="px-5 py-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {coupons.map((coupon) => (
                                <tr key={coupon.id} className="text-label-sm">
                                    <td className="px-5 py-4 text-strong-950">
                                        {coupon.code}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {coupon.discountType === "percent"
                                            ? `${coupon.discountValue}%`
                                            : currencyFormatter.format(
                                                  coupon.discountValue
                                              )}
                                    </td>
                                    <td className="px-5 py-4">
                                        <StatusBadge
                                            status={
                                                coupon.active ? "active" : "inactive"
                                            }
                                        />
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {formatDate(coupon.createdAt)}
                                    </td>
                                    <td className="px-5 py-4">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                void onToggleCoupon(coupon.id)
                                            }
                                            className="h-9 rounded-xl border border-stroke-soft-200 px-3 text-label-sm"
                                        >
                                            {coupon.active
                                                ? "Deactivate"
                                                : "Activate"}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {coupons.length === 0 ? (
                    <p className="px-5 py-12 text-center text-label-sm text-sub-600">
                        No coupons yet
                    </p>
                ) : null}
            </section>

            <InvoiceDetailModal
                invoice={viewInvoice}
                companyName={
                    viewInvoice
                        ? companyNameById[viewInvoice.companyId]
                        : undefined
                }
                onClose={() => setViewInvoice(null)}
            />
        </div>
    );
};

export default LiveBillingPage;
