"use client";

import Link from "next/link";

import QuotaBar from "@/components/Admin/QuotaBar";
import StatCard from "@/components/Admin/StatCard";
import StatusBadge from "@/components/Admin/StatusBadge";
import { ACTIVITIES } from "@/lib/admin/demoData";
import { getPlanById } from "@/lib/admin/plans";
import {
    getPlatformTotals,
    getStorageRemaining,
    getTokensRemaining,
} from "@/lib/admin/selectors";
import { useAdminData } from "@/context/AdminDataContext";

const numberFormatter = new Intl.NumberFormat("en-US");
const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
});

const DashboardPage = () => {
    const { companies, plans } = useAdminData();
    const totals = getPlatformTotals(companies);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Dashboard</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Platform-wide company, user, storage, and token usage.
                </p>
            </div>

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
                <section className="overflow-hidden rounded-2xl border border-stroke-soft-200 bg-white-0">
                    <div className="flex items-center justify-between gap-4 border-b border-stroke-soft-200 px-5 py-4">
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
                        <table className="w-full min-w-[760px] text-left">
                            <thead className="bg-weak-50 text-label-xs text-sub-600">
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

                <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                    <h2 className="text-label-lg text-strong-950">Recent activity</h2>
                    <div className="mt-4 divide-y divide-stroke-soft-200">
                        {ACTIVITIES.map((activity) => (
                            <div key={activity.id} className="py-4 first:pt-0 last:pb-0">
                                <p className="text-label-sm text-strong-950">
                                    {activity.text}
                                </p>
                                <p className="mt-1 text-label-xs text-sub-600">
                                    {dateFormatter.format(new Date(activity.at))}
                                </p>
                            </div>
                        ))}
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
        </div>
    );
};

export default DashboardPage;
