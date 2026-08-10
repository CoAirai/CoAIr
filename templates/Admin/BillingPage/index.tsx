"use client";

import { FormEvent, Fragment, useMemo, useState } from "react";

import StatCard from "@/components/Admin/StatCard";
import StatusBadge from "@/components/Admin/StatusBadge";
import { useAdminData } from "@/context/AdminDataContext";
import { PAYMENTS } from "@/lib/admin/billingDemoData";
import {
    filterInvoices,
    getBillingStats,
} from "@/lib/admin/billingSelectors";
import type { InvoiceStatus } from "@/lib/admin/billingTypes";
import type { CouponDiscountType } from "@/lib/admin/wave2Types";

const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
});
const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
});

const formatDate = (date: string) =>
    dateFormatter.format(new Date(`${date}T00:00:00`));

const BillingPage = () => {
    const {
        companies,
        invoices,
        coupons,
        taxSettings,
        retryInvoice,
        refundInvoice,
        createCoupon,
        toggleCoupon,
        updateTax,
    } = useAdminData();

    const [search, setSearch] = useState("");
    const [status, setStatus] = useState<InvoiceStatus | "all">("all");
    const [refundTargetId, setRefundTargetId] = useState<string | null>(null);
    const [refundReason, setRefundReason] = useState("");

    const [couponCode, setCouponCode] = useState("");
    const [couponType, setCouponType] = useState<CouponDiscountType>("percent");
    const [couponValue, setCouponValue] = useState("10");
    const [couponError, setCouponError] = useState<string | null>(null);
    const [couponSuccess, setCouponSuccess] = useState<string | null>(null);

    const [taxPercent, setTaxPercent] = useState(String(taxSettings.percent));
    const [taxRegion, setTaxRegion] = useState(taxSettings.regionLabel);
    const [taxSaved, setTaxSaved] = useState(false);

    const companyNameById = useMemo(
        () => Object.fromEntries(companies.map((company) => [company.id, company.name])),
        [companies]
    );

    const billingStats = useMemo(
        () => getBillingStats(invoices, PAYMENTS),
        [invoices]
    );

    const filteredInvoices = useMemo(
        () =>
            filterInvoices(invoices, {
                search,
                status,
                companyNameById,
            }),
        [invoices, search, status, companyNameById]
    );

    const startRefund = (invoiceId: string) => {
        setRefundTargetId(invoiceId);
        setRefundReason("");
    };

    const cancelRefund = () => {
        setRefundTargetId(null);
        setRefundReason("");
    };

    const confirmRefund = (invoiceId: string) => {
        refundInvoice(invoiceId, refundReason.trim());
        setRefundTargetId(null);
        setRefundReason("");
    };

    const onCreateCoupon = (event: FormEvent) => {
        event.preventDefault();
        const result = createCoupon({
            code: couponCode,
            discountType: couponType,
            discountValue: Number(couponValue),
        });
        if (!result.ok) {
            setCouponError(result.error ?? "Unable to create coupon");
            setCouponSuccess(null);
            return;
        }
        setCouponError(null);
        setCouponSuccess(`Coupon ${couponCode.trim().toUpperCase()} created`);
        setCouponCode("");
        setCouponType("percent");
        setCouponValue("10");
    };

    const onSaveTax = (event: FormEvent) => {
        event.preventDefault();
        const percent = Number(taxPercent);
        if (!Number.isFinite(percent) || percent < 0) return;
        updateTax({ percent, regionLabel: taxRegion.trim() || "Default" });
        setTaxSaved(true);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Billing</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Monitor revenue, invoices, and payment activity across companies.
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="MRR"
                    value={currencyFormatter.format(billingStats.mrrUsd)}
                    hint="Monthly recurring revenue"
                />
                <StatCard
                    label="Outstanding"
                    value={currencyFormatter.format(billingStats.outstandingUsd)}
                    hint="Open and past-due invoices"
                />
                <StatCard
                    label="Paid this month"
                    value={currencyFormatter.format(billingStats.paidThisMonthUsd)}
                    hint="Successful payments"
                />
                <StatCard
                    label="Failed payments"
                    value={billingStats.failedPaymentCount.toString()}
                    hint="Payments requiring attention"
                />
            </div>

            <form
                onSubmit={onSaveTax}
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
                    {taxSaved && (
                        <p className="text-label-sm text-green-600">
                            Tax settings updated
                        </p>
                    )}
                </div>
            </form>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 p-5">
                    <h2 className="text-label-lg text-strong-950">Invoices</h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Review invoice balances, retry past-due payments, and issue
                        refunds.
                    </p>
                </div>

                <div className="grid gap-3 border-b border-stroke-soft-200 p-5 md:grid-cols-[minmax(240px,1fr)_200px]">
                    <label className="block">
                        <span className="sr-only">Search invoices</span>
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search by company name"
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-label-sm text-strong-950 outline-none placeholder:text-sub-600 focus:border-blue-500"
                        />
                    </label>
                    <label className="block">
                        <span className="sr-only">Filter by invoice status</span>
                        <select
                            value={status}
                            onChange={(event) =>
                                setStatus(
                                    event.target.value as InvoiceStatus | "all"
                                )
                            }
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-label-sm text-strong-950 outline-none focus:border-blue-500"
                        >
                            <option value="all">All statuses</option>
                            <option value="paid">Paid</option>
                            <option value="open">Open</option>
                            <option value="past_due">Past due</option>
                            <option value="refunded">Refunded</option>
                        </select>
                    </label>
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
                                                "Unknown"}
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
                                            <div className="flex gap-2">
                                                {invoice.status === "past_due" && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            retryInvoice(invoice.id)
                                                        }
                                                        className="h-9 rounded-xl bg-blue-500 px-3 text-label-sm text-white-0 hover:bg-blue-600"
                                                    >
                                                        Retry
                                                    </button>
                                                )}
                                                {invoice.status === "paid" && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            startRefund(invoice.id)
                                                        }
                                                        className="h-9 rounded-xl border border-stroke-soft-200 px-3 text-label-sm text-strong-950 hover:bg-weak-50"
                                                    >
                                                        Refund
                                                    </button>
                                                )}
                                                {invoice.status !== "past_due" &&
                                                    invoice.status !== "paid" && (
                                                        <span className="text-label-xs text-sub-600">
                                                            —
                                                        </span>
                                                    )}
                                            </div>
                                        </td>
                                    </tr>
                                    {refundTargetId === invoice.id && (
                                        <tr>
                                            <td
                                                colSpan={7}
                                                className="bg-weak-50 px-5 py-4"
                                            >
                                                <div className="flex flex-wrap items-end gap-3">
                                                    <label className="block flex-1 min-w-[240px]">
                                                        <span className="mb-1.5 block text-label-xs text-sub-600">
                                                            Refund reason
                                                        </span>
                                                        <input
                                                            autoFocus
                                                            value={refundReason}
                                                            onChange={(event) =>
                                                                setRefundReason(
                                                                    event.target.value
                                                                )
                                                            }
                                                            placeholder="Customer requested refund"
                                                            className="h-10 w-full rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-label-sm outline-none focus:border-blue-500"
                                                        />
                                                    </label>
                                                    <button
                                                        type="button"
                                                        disabled={
                                                            !refundReason.trim()
                                                        }
                                                        onClick={() =>
                                                            confirmRefund(invoice.id)
                                                        }
                                                        className="h-10 rounded-xl bg-red-500 px-3 text-label-sm text-white-0 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        Confirm refund
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={cancelRefund}
                                                        className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm text-strong-950 hover:bg-white-0"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filteredInvoices.length === 0 && (
                    <div className="px-5 py-12 text-center">
                        <p className="text-label-sm text-strong-950">
                            No invoices found
                        </p>
                        <p className="mt-1 text-label-xs text-sub-600">
                            Try changing your search or filters.
                        </p>
                    </div>
                )}

                <div className="border-t border-stroke-soft-200 px-5 py-3 text-label-xs text-sub-600">
                    Showing {filteredInvoices.length} of {invoices.length} invoices
                </div>
            </section>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 p-5">
                    <h2 className="text-label-lg text-strong-950">Coupons</h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Create discount codes and toggle their availability.
                    </p>
                </div>

                <form
                    onSubmit={onCreateCoupon}
                    className="grid gap-3 border-b border-stroke-soft-200 p-5 md:grid-cols-[minmax(160px,1fr)_160px_160px_auto]"
                >
                    <label className="block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Code
                        </span>
                        <input
                            required
                            value={couponCode}
                            onChange={(event) => setCouponCode(event.target.value)}
                            placeholder="SAVE20"
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Type
                        </span>
                        <select
                            value={couponType}
                            onChange={(event) =>
                                setCouponType(
                                    event.target.value as CouponDiscountType
                                )
                            }
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        >
                            <option value="percent">Percent</option>
                            <option value="fixed">Fixed ($)</option>
                        </select>
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Value
                        </span>
                        <input
                            type="number"
                            min={1}
                            value={couponValue}
                            onChange={(event) => setCouponValue(event.target.value)}
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        />
                    </label>
                    <div className="flex items-end">
                        <button
                            type="submit"
                            className="h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0 hover:opacity-90"
                        >
                            Create coupon
                        </button>
                    </div>
                    {couponError && (
                        <p className="text-label-xs text-red-500 md:col-span-4">
                            {couponError}
                        </p>
                    )}
                    {couponSuccess && (
                        <p className="text-label-xs text-green-600 md:col-span-4">
                            {couponSuccess}
                        </p>
                    )}
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
                                            onClick={() => toggleCoupon(coupon.id)}
                                            className="h-9 rounded-xl border border-stroke-soft-200 px-3 text-label-sm text-strong-950 hover:bg-weak-50"
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

                {coupons.length === 0 && (
                    <div className="px-5 py-12 text-center">
                        <p className="text-label-sm text-strong-950">
                            No coupons yet
                        </p>
                        <p className="mt-1 text-label-xs text-sub-600">
                            Create a coupon to offer a discount.
                        </p>
                    </div>
                )}

                <div className="border-t border-stroke-soft-200 px-5 py-3 text-label-xs text-sub-600">
                    Showing {coupons.length} coupons
                </div>
            </section>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 p-5">
                    <h2 className="text-label-lg text-strong-950">Payments</h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Latest payment attempts across all companies.
                    </p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">Payment</th>
                                <th className="px-5 py-3 font-medium">Company</th>
                                <th className="px-5 py-3 font-medium">Invoice</th>
                                <th className="px-5 py-3 font-medium">Amount</th>
                                <th className="px-5 py-3 font-medium">Method</th>
                                <th className="px-5 py-3 font-medium">Status</th>
                                <th className="px-5 py-3 font-medium">Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {PAYMENTS.map((payment) => (
                                <tr key={payment.id} className="text-label-sm">
                                    <td className="px-5 py-4 text-strong-950">
                                        {payment.id}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {companyNameById[payment.companyId] ??
                                            "Unknown"}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {payment.invoiceId ?? "—"}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {currencyFormatter.format(payment.amountUsd)}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        Card •••• {payment.last4}
                                    </td>
                                    <td className="px-5 py-4">
                                        <StatusBadge status={payment.status} />
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {formatDate(payment.paidAt)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="border-t border-stroke-soft-200 px-5 py-3 text-label-xs text-sub-600">
                    Showing {PAYMENTS.length} payments
                </div>
            </section>
        </div>
    );
};

export default BillingPage;
