"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Fragment, useMemo, useState } from "react";

import QuotaBar from "@/components/Admin/QuotaBar";
import StatusBadge from "@/components/Admin/StatusBadge";
import { useAdminData } from "@/context/AdminDataContext";
import { getPlanById } from "@/lib/admin/plans";
import { getStorageRemaining, getTokensRemaining } from "@/lib/admin/selectors";
import type { ModuleId, PlanId, UserRole } from "@/lib/admin/types";
import {
    effectiveSellRate,
    providerCostUsdForTokens,
} from "@/lib/billing/tokenEconomics";

type Props = {
    id: string;
};

type TabId = "overview" | "users" | "tokens" | "storage" | "billing";

const TABS: { id: TabId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "users", label: "Users" },
    { id: "tokens", label: "Tokens" },
    { id: "storage", label: "Storage" },
    { id: "billing", label: "Billing" },
];

const ROLE_OPTIONS: UserRole[] = ["admin", "member", "viewer"];

const TOKEN_ACTION_LABELS: Record<string, string> = {
    "tokens.credit": "Tokens credited",
    "tokens.debit": "Tokens debited",
    "tokens.rates_update": "Token rates updated",
    "tokens.sell_override": "Sell rate override updated",
    "tokens.topup_approve": "Top-up approved",
    "tokens.topup_deny": "Top-up denied",
};

const numberFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
});
const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
});

const formatDate = (date: string) =>
    dateFormatter.format(new Date(`${date}T00:00:00`));

const CompanyDetailPage = ({ id }: Props) => {
    const {
        companies,
        users,
        invoices,
        auditLog,
        setCompanyStatus,
        updateCompanyPlan,
        adjustTokens,
        setUserStatus,
        setUserRole,
        impersonateUser,
        stopImpersonation,
        forceLogoutUser,
        impersonatingUserId,
        retryInvoice,
        refundInvoice,
        plans,
        setCompanyAddOn,
        tokenEconomics,
        setCompanySellRateOverride,
    } = useAdminData();

    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [tokenAmount, setTokenAmount] = useState("1000");
    const [tokenMode, setTokenMode] = useState<"credit" | "debit">("credit");
    const [tokenNote, setTokenNote] = useState("");
    const [tokenMessage, setTokenMessage] = useState<string | null>(null);
    const [tokenError, setTokenError] = useState<string | null>(null);
    const [sellOverride, setSellOverride] = useState("");
    const [overrideMessage, setOverrideMessage] = useState<string | null>(null);

    const [refundTargetId, setRefundTargetId] = useState<string | null>(null);
    const [refundReason, setRefundReason] = useState("");

    const company = companies.find((item) => item.id === id);

    const companyUsers = useMemo(
        () => users.filter((user) => user.companyId === id),
        [users, id]
    );
    const companyInvoices = useMemo(
        () => invoices.filter((invoice) => invoice.companyId === id),
        [invoices, id]
    );
    const tokenAuditEntries = useMemo(
        () =>
            auditLog.filter(
                (entry) =>
                    entry.action.startsWith("tokens.") && entry.targetId === id
            ),
        [auditLog, id]
    );

    const requestedTab = searchParams.get("tab");
    const activeTab: TabId = TABS.some((tab) => tab.id === requestedTab)
        ? (requestedTab as TabId)
        : "overview";

    const goToTab = (tab: TabId) => {
        const params = new URLSearchParams(searchParams.toString());
        if (tab === "overview") {
            params.delete("tab");
        } else {
            params.set("tab", tab);
        }
        const query = params.toString();
        router.push(`${pathname}${query ? `?${query}` : ""}`, {
            scroll: false,
        });
    };

    if (!company) {
        return (
            <div className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-8 text-center">
                <h1 className="text-label-xl text-strong-950">
                    Company not found
                </h1>
                <p className="mt-2 text-label-sm text-sub-600">
                    The requested company does not exist in the current session.
                </p>
                <Link
                    href="/admin/companies"
                    className="mt-5 inline-flex text-label-sm text-blue-500 hover:text-blue-600"
                >
                    Back to companies
                </Link>
            </div>
        );
    }

    const plan = getPlanById(company.planId, plans);
    const storageRemaining = getStorageRemaining(company);
    const tokensRemaining = getTokensRemaining(company);

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

    const onAdjustTokens = (event: FormEvent) => {
        event.preventDefault();
        const value = Number(tokenAmount);
        if (!Number.isFinite(value) || value <= 0) {
            setTokenError("Enter a valid positive amount");
            setTokenMessage(null);
            return;
        }
        const delta = tokenMode === "credit" ? value : -value;
        const result = adjustTokens(company.id, delta, tokenNote.trim());
        if (!result.ok) {
            setTokenError(result.error ?? "Adjustment failed");
            setTokenMessage(null);
            return;
        }
        setTokenError(null);
        setTokenMessage(
            `${tokenMode === "credit" ? "Credited" : "Debited"} ${numberFormatter.format(value)} tokens`
        );
        setTokenNote("");
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <Link
                        href="/admin/companies"
                        className="text-label-sm text-blue-500 hover:text-blue-600"
                    >
                        ← Back to companies
                    </Link>
                    <h1 className="mt-2 text-label-xl text-strong-950">
                        {company.name}
                    </h1>
                    <p className="mt-1 text-label-sm text-sub-600">
                        {company.industry} · Created {formatDate(company.createdAt)}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <StatusBadge status={company.status} />
                    {company.status === "suspended" ? (
                        <button
                            type="button"
                            className="h-10 rounded-full bg-blue-500 px-4 text-label-sm text-white-0"
                            onClick={() =>
                                setCompanyStatus(company.id, "active")
                            }
                        >
                            Activate
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="h-10 rounded-full border border-red-200 px-4 text-label-sm text-red-500"
                            onClick={() =>
                                setCompanyStatus(company.id, "suspended")
                            }
                        >
                            Suspend
                        </button>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap gap-2 rounded-full border border-stroke-soft-200 bg-white-0 p-1.5">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => goToTab(tab.id)}
                        className={`h-9 rounded-full px-4 text-label-sm transition-colors ${
                            activeTab === tab.id
                                ? "bg-strong-950 text-white-0"
                                : "text-sub-600 hover:text-strong-950"
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === "overview" && (
                <div className="space-y-6">
                    <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                        <h2 className="text-label-lg text-strong-950">
                            Company details
                        </h2>
                        <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <div>
                                <dt className="text-label-xs text-sub-600">
                                    Company ID
                                </dt>
                                <dd className="mt-1 text-label-sm text-strong-950">
                                    {company.id}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-label-xs text-sub-600">
                                    Industry
                                </dt>
                                <dd className="mt-1 text-label-sm text-strong-950">
                                    {company.industry}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-label-xs text-sub-600">
                                    Created
                                </dt>
                                <dd className="mt-1 text-label-sm text-strong-950">
                                    {formatDate(company.createdAt)}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-label-xs text-sub-600">
                                    Users
                                </dt>
                                <dd className="mt-1 text-label-sm text-strong-950">
                                    {numberFormatter.format(company.usersCount)}
                                </dd>
                            </div>
                        </dl>
                    </section>

                    <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                        <h2 className="text-label-lg text-strong-950">Package</h2>
                        <div className="mt-4 max-w-xs">
                            <label className="block">
                                <span className="mb-1.5 block text-label-xs text-sub-600">
                                    Plan
                                </span>
                                <select
                                    value={company.planId}
                                    onChange={(event) =>
                                        updateCompanyPlan(
                                            company.id,
                                            event.target.value as PlanId
                                        )
                                    }
                                    className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                                >
                                    {plans.map((planOption) => (
                                        <option
                                            key={planOption.id}
                                            value={planOption.id}
                                        >
                                            {planOption.name} · {planOption.priceLabel}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <p className="mt-3 text-label-sm text-sub-600">
                            Current: {plan?.name ?? "Unknown"} · {plan?.priceLabel}
                            {plan
                                ? ` · ${plan.usersIncluded} seats · $${plan.apiCreditsUsd} credits`
                                : ""}
                        </p>
                        <div className="mt-4 space-y-2">
                            <p className="text-label-xs text-sub-600">
                                Module add-ons
                            </p>
                            {(["chronology", "forensic"] as ModuleId[]).map(
                                (moduleId) => (
                                    <label
                                        key={moduleId}
                                        className="flex items-center gap-2 text-label-sm text-strong-950"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={company.addOns.includes(
                                                moduleId
                                            )}
                                            onChange={(event) =>
                                                setCompanyAddOn(
                                                    company.id,
                                                    moduleId,
                                                    event.target.checked
                                                )
                                            }
                                        />
                                        {moduleId === "chronology"
                                            ? "Chronology"
                                            : "Forensic Delay Analysis"}
                                    </label>
                                )
                            )}
                        </div>
                        <div className="mt-5 space-y-4">
                            <QuotaBar
                                label="Storage"
                                used={company.storageUsedGb}
                                limit={company.storageLimitGb}
                                unit="GB"
                            />
                            <QuotaBar
                                label="Tokens"
                                used={company.tokensUsed}
                                limit={company.tokenLimit}
                            />
                        </div>
                    </section>
                </div>
            )}

            {activeTab === "users" && (
                <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                    <div className="border-b border-stroke-soft-200 p-5">
                        <h2 className="text-label-lg text-strong-950">
                            Company users
                        </h2>
                        <p className="mt-1 text-label-xs text-sub-600">
                            Oversight only — this company invites its own users.
                        </p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[960px] text-left">
                            <thead className="bg-weak-50 text-label-xs text-sub-600">
                                <tr>
                                    <th className="px-5 py-3 font-medium">Name</th>
                                    <th className="px-5 py-3 font-medium">Email</th>
                                    <th className="px-5 py-3 font-medium">Role</th>
                                    <th className="px-5 py-3 font-medium">Status</th>
                                    <th className="px-5 py-3 font-medium">
                                        Last login
                                    </th>
                                    <th className="px-5 py-3 font-medium">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stroke-soft-200">
                                {companyUsers.map((user) => (
                                    <tr key={user.id} className="text-label-sm">
                                        <td className="px-5 py-4 text-strong-950">
                                            {user.name}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {user.email}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            <select
                                                value={user.role}
                                                onChange={(event) =>
                                                    setUserRole(
                                                        user.id,
                                                        event.target
                                                            .value as UserRole
                                                    )
                                                }
                                                className="h-8 rounded-lg border border-stroke-soft-200 px-2 text-label-xs outline-none focus:border-blue-500"
                                            >
                                                {ROLE_OPTIONS.map((role) => (
                                                    <option
                                                        key={role}
                                                        value={role}
                                                    >
                                                        {role.charAt(0).toUpperCase() +
                                                            role.slice(1)}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="px-5 py-4">
                                            <StatusBadge status={user.status} />
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {user.lastLoginAt
                                                ? formatDate(user.lastLoginAt)
                                                : "Never"}
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex flex-wrap items-center gap-3">
                                                {user.status === "suspended" ? (
                                                    <button
                                                        type="button"
                                                        className="text-label-sm text-blue-500 hover:text-blue-600"
                                                        onClick={() =>
                                                            setUserStatus(
                                                                user.id,
                                                                "active"
                                                            )
                                                        }
                                                    >
                                                        Activate
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="text-label-sm text-red-500 hover:text-red-600"
                                                        onClick={() =>
                                                            setUserStatus(
                                                                user.id,
                                                                "suspended"
                                                            )
                                                        }
                                                    >
                                                        Suspend
                                                    </button>
                                                )}
                                                {impersonatingUserId ===
                                                user.id ? (
                                                    <button
                                                        type="button"
                                                        className="text-label-sm text-sub-600 hover:text-strong-950"
                                                        onClick={stopImpersonation}
                                                    >
                                                        Stop impersonating
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="text-label-sm text-sub-600 hover:text-strong-950"
                                                        onClick={() =>
                                                            impersonateUser(
                                                                user.id
                                                            )
                                                        }
                                                    >
                                                        Impersonate
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="text-label-sm text-sub-600 hover:text-strong-950"
                                                    onClick={() =>
                                                        forceLogoutUser(user.id)
                                                    }
                                                >
                                                    Force logout
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {companyUsers.length === 0 && (
                        <div className="px-5 py-12 text-center">
                            <p className="text-label-sm text-strong-950">
                                No users found for this company
                            </p>
                        </div>
                    )}
                    <div className="border-t border-stroke-soft-200 px-5 py-3 text-label-xs text-sub-600">
                        Showing {companyUsers.length} users
                    </div>
                </section>
            )}

            {activeTab === "tokens" && (
                <div className="space-y-6">
                    <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                        <h2 className="text-label-lg text-strong-950">
                            Token balance
                        </h2>
                        <div className="mt-4">
                            <QuotaBar
                                label="Tokens"
                                used={company.tokensUsed}
                                limit={company.tokenLimit}
                            />
                        </div>
                        <p className="mt-3 text-label-sm text-sub-600">
                            Remaining: {numberFormatter.format(tokensRemaining)} ·
                            Est. provider cost of usage:{" "}
                            {currencyFormatter.format(
                                providerCostUsdForTokens(
                                    company.tokensUsed,
                                    tokenEconomics.providerTokensPerUsd
                                )
                            )}
                        </p>
                    </section>

                    <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                        <h2 className="text-label-lg text-strong-950">
                            Sell rate override
                        </h2>
                        <p className="mt-1 text-label-xs text-sub-600">
                            Optional. Leave blank to use the global sell rate (
                            {tokenEconomics.sellTokensPerUsd} tokens/$1). Effective
                            rate:{" "}
                            {effectiveSellRate(
                                tokenEconomics,
                                company.sellTokensPerUsdOverride
                            )}{" "}
                            tokens/$1.
                        </p>
                        <div className="mt-4 flex flex-wrap items-end gap-3">
                            <label className="block">
                                <span className="mb-1.5 block text-label-xs text-sub-600">
                                    Sell tokens / $1
                                </span>
                                <input
                                    type="number"
                                    min={1}
                                    value={
                                        sellOverride ||
                                        company.sellTokensPerUsdOverride?.toString() ||
                                        ""
                                    }
                                    onChange={(event) =>
                                        setSellOverride(event.target.value)
                                    }
                                    placeholder={String(
                                        tokenEconomics.sellTokensPerUsd
                                    )}
                                    className="h-10 w-40 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                                />
                            </label>
                            <button
                                type="button"
                                className="h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0"
                                onClick={() => {
                                    const value = sellOverride.trim();
                                    const result = setCompanySellRateOverride(
                                        company.id,
                                        value ? Number(value) : undefined
                                    );
                                    setOverrideMessage(
                                        result.ok
                                            ? value
                                                ? "Sell override saved"
                                                : "Sell override cleared"
                                            : (result.error ?? "Unable to save")
                                    );
                                }}
                            >
                                Save override
                            </button>
                            <button
                                type="button"
                                className="h-10 rounded-full border border-stroke-soft-200 px-4 text-label-sm text-strong-950"
                                onClick={() => {
                                    setSellOverride("");
                                    setCompanySellRateOverride(company.id);
                                    setOverrideMessage("Sell override cleared");
                                }}
                            >
                                Clear
                            </button>
                            {overrideMessage ? (
                                <p className="text-label-sm text-sub-600">
                                    {overrideMessage}
                                </p>
                            ) : null}
                        </div>
                    </section>

                    <form
                        onSubmit={onAdjustTokens}
                        className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5"
                    >
                        <h2 className="text-label-lg text-strong-950">
                            Manual token adjustment
                        </h2>
                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <label className="block">
                                <span className="mb-1.5 block text-label-xs text-sub-600">
                                    Action
                                </span>
                                <select
                                    value={tokenMode}
                                    onChange={(event) =>
                                        setTokenMode(
                                            event.target.value as
                                                | "credit"
                                                | "debit"
                                        )
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
                                    value={tokenAmount}
                                    onChange={(event) =>
                                        setTokenAmount(event.target.value)
                                    }
                                    className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-label-xs text-sub-600">
                                    Note
                                </span>
                                <input
                                    value={tokenNote}
                                    onChange={(event) =>
                                        setTokenNote(event.target.value)
                                    }
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
                            {tokenMessage && (
                                <p className="text-label-sm text-green-600">
                                    {tokenMessage}
                                </p>
                            )}
                            {tokenError && (
                                <p className="text-label-sm text-red-500">
                                    {tokenError}
                                </p>
                            )}
                        </div>
                    </form>

                    <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                        <div className="border-b border-stroke-soft-200 p-5">
                            <h2 className="text-label-lg text-strong-950">
                                Token audit trail
                            </h2>
                            <p className="mt-1 text-label-xs text-sub-600">
                                Credits and debits recorded for this company in
                                this session.
                            </p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[720px] text-left">
                                <thead className="bg-weak-50 text-label-xs text-sub-600">
                                    <tr>
                                        <th className="px-5 py-3 font-medium">
                                            When
                                        </th>
                                        <th className="px-5 py-3 font-medium">
                                            Action
                                        </th>
                                        <th className="px-5 py-3 font-medium">
                                            Detail
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-stroke-soft-200">
                                    {tokenAuditEntries.map((entry) => (
                                        <tr key={entry.id} className="text-label-sm">
                                            <td className="px-5 py-4 text-sub-600">
                                                {dateTimeFormatter.format(
                                                    new Date(entry.at)
                                                )}
                                            </td>
                                            <td className="px-5 py-4 text-strong-950">
                                                {TOKEN_ACTION_LABELS[
                                                    entry.action
                                                ] ?? entry.action}
                                            </td>
                                            <td className="px-5 py-4 text-sub-600">
                                                {entry.detail}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {tokenAuditEntries.length === 0 && (
                            <div className="px-5 py-12 text-center">
                                <p className="text-label-sm text-strong-950">
                                    No token adjustments yet
                                </p>
                            </div>
                        )}
                    </section>
                </div>
            )}

            {activeTab === "storage" && (
                <div className="space-y-6">
                    <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                        <h2 className="text-label-lg text-strong-950">
                            Storage usage
                        </h2>
                        <div className="mt-4">
                            <QuotaBar
                                label="Storage"
                                used={company.storageUsedGb}
                                limit={company.storageLimitGb}
                                unit="GB"
                            />
                        </div>
                        <p className="mt-3 text-label-sm text-sub-600">
                            Remaining: {numberFormatter.format(storageRemaining)}{" "}
                            GB
                        </p>
                    </section>
                    <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                        <h2 className="text-label-lg text-strong-950">
                            File storage
                        </h2>
                        <p className="mt-2 text-label-sm text-sub-600">
                            File storage is backed by a mocked S3 bucket in this
                            demo environment — no real objects are uploaded or
                            billed. Usage figures above are simulated for
                            illustration only.
                        </p>
                    </section>
                </div>
            )}

            {activeTab === "billing" && (
                <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                    <div className="border-b border-stroke-soft-200 p-5">
                        <h2 className="text-label-lg text-strong-950">
                            Invoices
                        </h2>
                        <p className="mt-1 text-label-xs text-sub-600">
                            Review balances, retry past-due payments, and issue
                            refunds for this company.
                        </p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[840px] text-left">
                            <thead className="bg-weak-50 text-label-xs text-sub-600">
                                <tr>
                                    <th className="px-5 py-3 font-medium">
                                        Invoice
                                    </th>
                                    <th className="px-5 py-3 font-medium">
                                        Amount
                                    </th>
                                    <th className="px-5 py-3 font-medium">
                                        Status
                                    </th>
                                    <th className="px-5 py-3 font-medium">
                                        Issued
                                    </th>
                                    <th className="px-5 py-3 font-medium">Due</th>
                                    <th className="px-5 py-3 font-medium">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stroke-soft-200">
                                {companyInvoices.map((invoice) => (
                                    <Fragment key={invoice.id}>
                                        <tr className="text-label-sm">
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
                                            <td className="px-5 py-4">
                                                <div className="flex gap-2">
                                                    {invoice.status ===
                                                        "past_due" && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                retryInvoice(
                                                                    invoice.id
                                                                )
                                                            }
                                                            className="h-9 rounded-xl bg-blue-500 px-3 text-label-sm text-white-0 hover:bg-blue-600"
                                                        >
                                                            Retry
                                                        </button>
                                                    )}
                                                    {invoice.status ===
                                                        "paid" && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                startRefund(
                                                                    invoice.id
                                                                )
                                                            }
                                                            className="h-9 rounded-xl border border-stroke-soft-200 px-3 text-label-sm text-strong-950 hover:bg-weak-50"
                                                        >
                                                            Refund
                                                        </button>
                                                    )}
                                                    {invoice.status !==
                                                        "past_due" &&
                                                        invoice.status !==
                                                            "paid" && (
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
                                                    colSpan={6}
                                                    className="bg-weak-50 px-5 py-4"
                                                >
                                                    <div className="flex flex-wrap items-end gap-3">
                                                        <label className="block flex-1 min-w-[240px]">
                                                            <span className="mb-1.5 block text-label-xs text-sub-600">
                                                                Refund reason
                                                            </span>
                                                            <input
                                                                autoFocus
                                                                value={
                                                                    refundReason
                                                                }
                                                                onChange={(
                                                                    event
                                                                ) =>
                                                                    setRefundReason(
                                                                        event
                                                                            .target
                                                                            .value
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
                                                                confirmRefund(
                                                                    invoice.id
                                                                )
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
                    {companyInvoices.length === 0 && (
                        <div className="px-5 py-12 text-center">
                            <p className="text-label-sm text-strong-950">
                                No invoices found for this company
                            </p>
                        </div>
                    )}
                    <div className="border-t border-stroke-soft-200 px-5 py-3 text-label-xs text-sub-600">
                        Showing {companyInvoices.length} invoices
                    </div>
                </section>
            )}
        </div>
    );
};

export default CompanyDetailPage;
