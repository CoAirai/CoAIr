"use client";

import Link from "next/link";
import { useMemo } from "react";

import PageEnter from "@/components/Motion/PageEnter";
import PageHeader from "@/components/Admin/PageHeader";
import QuotaBar from "@/components/Admin/QuotaBar";
import StatCard from "@/components/Admin/StatCard";
import StatusBadge from "@/components/Admin/StatusBadge";
import { formatAuditHeadline } from "@/lib/admin/auditLabels";
import { getPlanById } from "@/lib/admin/plans";
import {
    getPlatformTotals,
    getStorageRemaining,
    getTokensRemaining,
} from "@/lib/admin/selectors";
import { useAdminData } from "@/context/AdminDataContext";

const numberFormatter = new Intl.NumberFormat("en-US");
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
});

const RECENT_ACTIVITY_LIMIT = 8;

const DashboardPage = () => {
    const { companies, plans, auditLog } = useAdminData();
    const totals = getPlatformTotals(companies);
    const recentActivity = useMemo(
        () => auditLog.slice(0, RECENT_ACTIVITY_LIMIT),
        [auditLog]
    );

    return (
        <PageEnter className="page-stack">
            <PageHeader
                title="Dashboard"
                description="Platform-wide company, user, storage, and token usage."
            />

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="Total companies"
                    value={numberFormatter.format(totals.companyCount)}
                    hint="All company accounts"
                />
                <StatCard
                    label="Total users"
                    value={numberFormatter.format(totals.userCount)}
                    hint="Across all companies"
                />
                <StatCard
                    label="Platform storage"
                    value={`${numberFormatter.format(totals.storageUsedGb)} GB`}
                    hint={`of ${numberFormatter.format(totals.storageLimitGb)} GB allocated`}
                />
                <StatCard
                    label="Platform tokens"
                    value={numberFormatter.format(totals.tokensUsed)}
                    hint={`of ${numberFormatter.format(totals.tokenLimit)} allocated`}
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
                <section className="surface-panel overflow-hidden">
                    <div className="surface-panel-header flex items-center justify-between gap-4">
                        <div>
                            <h2 className="text-label-lg text-strong-950">
                                Company usage
                            </h2>
                            <p className="mt-1 text-label-xs text-sub-600">
                                Remaining quota by company
                            </p>
                        </div>
                        <Link
                            href="/admin/companies"
                            className="text-label-sm text-blue-500 hover:text-blue-600"
                        >
                            View all
                        </Link>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="surface-table w-full min-w-[760px] text-left">
                            <thead>
                                <tr>
                                    <th className="px-5 py-3 font-medium">Company</th>
                                    <th className="px-5 py-3 font-medium">Plan</th>
                                    <th className="px-5 py-3 font-medium">
                                        Storage remaining
                                    </th>
                                    <th className="px-5 py-3 font-medium">
                                        Tokens remaining
                                    </th>
                                    <th className="px-5 py-3 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stroke-soft-200">
                                {companies.map((company) => (
                                    <tr key={company.id} className="text-label-sm">
                                        <td className="px-5 py-4">
                                            <Link
                                                href={`/admin/companies/${company.id}`}
                                                className="text-strong-950 hover:text-blue-500"
                                            >
                                                {company.name}
                                            </Link>
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {getPlanById(company.planId, plans)?.name ?? "Unknown"}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {numberFormatter.format(
                                                getStorageRemaining(company)
                                            )}{" "}
                                            GB
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {numberFormatter.format(
                                                getTokensRemaining(company)
                                            )}
                                        </td>
                                        <td className="px-5 py-4">
                                            <StatusBadge status={company.status} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="surface-panel p-5">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-label-lg text-strong-950">
                                Recent activity
                            </h2>
                            <p className="mt-1 text-label-xs text-sub-600">
                                From this session’s audit log
                            </p>
                        </div>
                        <Link
                            href="/admin/audit"
                            className="shrink-0 text-label-sm text-blue-500 hover:text-blue-600"
                        >
                            Audit log
                        </Link>
                    </div>
                    <div className="mt-4 divide-y divide-stroke-soft-200">
                        {recentActivity.length === 0 ? (
                            <p className="py-2 text-label-sm text-sub-600">
                                No admin actions yet. Create a company, approve
                                access, or change status to see activity here.
                            </p>
                        ) : (
                            recentActivity.map((entry) => (
                                <div
                                    key={entry.id}
                                    className="py-4 first:pt-0 last:pb-0"
                                >
                                    <p className="text-label-sm text-strong-950">
                                        {formatAuditHeadline(entry)}
                                    </p>
                                    {entry.detail ? (
                                        <p className="mt-1 text-label-xs text-sub-600">
                                            {entry.detail}
                                        </p>
                                    ) : null}
                                    <p className="mt-1 text-label-xs text-sub-600">
                                        {dateTimeFormatter.format(
                                            new Date(entry.at)
                                        )}{" "}
                                        · {entry.actor}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </div>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                <h2 className="text-label-lg text-strong-950">Platform allocation</h2>
                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                    <QuotaBar
                        label="Storage"
                        used={totals.storageUsedGb}
                        limit={totals.storageLimitGb}
                        unit="GB"
                    />
                    <QuotaBar
                        label="Tokens"
                        used={totals.tokensUsed}
                        limit={totals.tokenLimit}
                    />
                </div>
            </section>
        </PageEnter>
    );
};

export default DashboardPage;
