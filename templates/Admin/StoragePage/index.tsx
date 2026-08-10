"use client";

import Link from "next/link";
import { useMemo } from "react";

import StatCard from "@/components/Admin/StatCard";
import { useAdminData } from "@/context/AdminDataContext";
import { isNearStorageLimit, usagePercent } from "@/lib/admin/adminSelectors";
import { getPlatformTotals, getStorageRemaining } from "@/lib/admin/selectors";

const numberFormatter = new Intl.NumberFormat("en-US");

const StoragePage = () => {
    const { companies } = useAdminData();

    const totals = useMemo(
        () => getPlatformTotals(companies),
        [companies]
    );

    const nearLimitCount = useMemo(
        () =>
            companies.filter((company) =>
                isNearStorageLimit(company.storageUsedGb, company.storageLimitGb)
            ).length,
        [companies]
    );

    const topConsumers = useMemo(
        () =>
            [...companies]
                .sort((a, b) => b.storageUsedGb - a.storageUsedGb)
                .slice(0, 5),
        [companies]
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Storage</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Company storage usage against package limits.
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
                <StatCard
                    label="Total used"
                    value={`${numberFormatter.format(totals.storageUsedGb)} GB`}
                    hint="Across all companies"
                />
                <StatCard
                    label="Total allocated"
                    value={`${numberFormatter.format(totals.storageLimitGb)} GB`}
                    hint="Combined storage limits"
                />
                <StatCard
                    label="Near limit"
                    value={numberFormatter.format(nearLimitCount)}
                    hint="Companies at ≥80% usage"
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
                <section className="overflow-hidden rounded-2xl border border-stroke-soft-200 bg-white-0">
                    <div className="border-b border-stroke-soft-200 px-5 py-4">
                        <h2 className="text-label-lg text-strong-950">
                            By company
                        </h2>
                        <p className="mt-1 text-label-xs text-sub-600">
                            Storage quota usage per tenant
                        </p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-left">
                            <thead className="bg-weak-50 text-label-xs text-sub-600">
                                <tr>
                                    <th className="px-5 py-3 font-medium">
                                        Company
                                    </th>
                                    <th className="px-5 py-3 font-medium">
                                        Used
                                    </th>
                                    <th className="px-5 py-3 font-medium">
                                        Limit
                                    </th>
                                    <th className="px-5 py-3 font-medium">
                                        Remaining
                                    </th>
                                    <th className="px-5 py-3 font-medium">
                                        Usage
                                    </th>
                                    <th className="px-5 py-3 font-medium">
                                        Alert
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stroke-soft-200">
                                {companies.map((company) => {
                                    const remaining =
                                        getStorageRemaining(company);
                                    const percent = usagePercent(
                                        company.storageUsedGb,
                                        company.storageLimitGb
                                    );
                                    const nearLimit = isNearStorageLimit(
                                        company.storageUsedGb,
                                        company.storageLimitGb
                                    );

                                    return (
                                        <tr
                                            key={company.id}
                                            className="text-label-sm"
                                        >
                                            <td className="px-5 py-4">
                                                <Link
                                                    href={`/admin/companies/${company.id}?tab=storage`}
                                                    className="text-strong-950 hover:text-blue-500"
                                                >
                                                    {company.name}
                                                </Link>
                                            </td>
                                            <td className="px-5 py-4 text-sub-600">
                                                {numberFormatter.format(
                                                    company.storageUsedGb
                                                )}{" "}
                                                GB
                                            </td>
                                            <td className="px-5 py-4 text-sub-600">
                                                {numberFormatter.format(
                                                    company.storageLimitGb
                                                )}{" "}
                                                GB
                                            </td>
                                            <td
                                                className={`px-5 py-4 ${
                                                    nearLimit
                                                        ? "text-warning-base"
                                                        : "text-sub-600"
                                                }`}
                                            >
                                                {numberFormatter.format(
                                                    remaining
                                                )}{" "}
                                                GB
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="min-w-[120px]">
                                                    <span className="text-label-xs text-sub-600">
                                                        {percent}%
                                                    </span>
                                                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-weak-50">
                                                        <div
                                                            className={`h-full rounded-full transition-[width] ${
                                                                nearLimit
                                                                    ? "bg-warning-base"
                                                                    : "bg-blue-500"
                                                            }`}
                                                            style={{
                                                                width: `${percent}%`,
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                {nearLimit ? (
                                                    <span className="inline-flex h-6 items-center rounded-full bg-warning-base/10 px-2.5 text-label-xs text-warning-base">
                                                        Near limit
                                                    </span>
                                                ) : (
                                                    <span className="text-label-xs text-sub-600">
                                                        —
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                    <h2 className="text-label-lg text-strong-950">
                        Top consumers
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Highest storage usage
                    </p>
                    <ul className="mt-4 divide-y divide-stroke-soft-200">
                        {topConsumers.map((company, index) => (
                            <li
                                key={company.id}
                                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                            >
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="shrink-0 text-label-xs text-sub-600">
                                        #{index + 1}
                                    </span>
                                    <Link
                                        href={`/admin/companies/${company.id}?tab=storage`}
                                        className="truncate text-label-sm text-strong-950 hover:text-blue-500"
                                    >
                                        {company.name}
                                    </Link>
                                </div>
                                <span className="shrink-0 text-label-xs text-sub-600">
                                    {numberFormatter.format(
                                        company.storageUsedGb
                                    )}{" "}
                                    GB
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            </div>
        </div>
    );
};

export default StoragePage;
