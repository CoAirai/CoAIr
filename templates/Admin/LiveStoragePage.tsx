"use client";

import Link from "next/link";

import StatCard from "@/components/Admin/StatCard";
import { isNearStorageLimit, usagePercent } from "@/lib/admin/adminSelectors";
import { bytesToGb } from "@/lib/admin/liveHelpers";
import { useLiveAdmin } from "@/lib/coair/useLiveAdmin";

const numberFormatter = new Intl.NumberFormat("en-US");

const LiveStoragePage = () => {
    const { orgs, users, loading, error } = useLiveAdmin();
    const rows = orgs.map((org) => {
        const members = users.filter((user) => user.org_id === org.org_id);
        const usedBytes = members.reduce(
            (sum, user) => sum + (user.storage_used_bytes ?? 0),
            0
        );
        const limitBytes =
            members.reduce(
                (sum, user) => sum + (user.storage_limit_bytes ?? 0),
                0
            ) || org.default_storage_bytes || 0;
        const usedGb = bytesToGb(usedBytes);
        const limitGb = bytesToGb(limitBytes);
        return {
            id: org.org_id,
            name: org.name,
            usedGb,
            limitGb,
            percent: usagePercent(usedGb, limitGb),
            near: isNearStorageLimit(usedGb, limitGb),
        };
    });
    const totals = rows.reduce(
        (acc, row) => {
            acc.used += row.usedGb;
            acc.limit += row.limitGb;
            if (row.near) acc.near += 1;
            return acc;
        },
        { used: 0, limit: 0, near: 0 }
    );
    const top = [...rows].sort((a, b) => b.usedGb - a.usedGb).slice(0, 5);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Storage</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Live used vs allocated storage from billing accounts.
                </p>
            </div>
            {error ? (
                <p className="text-label-sm text-red-500">{error}</p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-3">
                <StatCard
                    label="Total used"
                    value={`${numberFormatter.format(totals.used)} GB`}
                    hint={loading ? "Loading…" : "Across all companies"}
                />
                <StatCard
                    label="Total allocated"
                    value={`${numberFormatter.format(totals.limit)} GB`}
                    hint="Combined storage limits"
                />
                <StatCard
                    label="Near limit"
                    value={numberFormatter.format(totals.near)}
                    hint="Companies at ≥80% usage"
                />
            </div>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
                <section className="overflow-hidden rounded-2xl border border-stroke-soft-200 bg-white-0">
                    <div className="border-b border-stroke-soft-200 px-5 py-4">
                        <h2 className="text-label-lg text-strong-950">
                            By company
                        </h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-left">
                            <thead className="bg-weak-50 text-label-xs text-sub-600">
                                <tr>
                                    <th className="px-5 py-3 font-medium">
                                        Company
                                    </th>
                                    <th className="px-5 py-3 font-medium">Used</th>
                                    <th className="px-5 py-3 font-medium">
                                        Limit
                                    </th>
                                    <th className="px-5 py-3 font-medium">
                                        Usage
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stroke-soft-200">
                                {loading && rows.length === 0 ? (
                                    <tr>
                                        <td
                                            className="px-5 py-4 text-label-sm text-sub-600"
                                            colSpan={4}
                                        >
                                            Loading storage…
                                        </td>
                                    </tr>
                                ) : null}
                                {rows.map((row) => (
                                    <tr key={row.id} className="text-label-sm">
                                        <td className="px-5 py-4">
                                            <Link
                                                href={`/admin/companies/${row.id}?tab=overview`}
                                                className="text-strong-950 hover:text-blue-500"
                                            >
                                                {row.name}
                                            </Link>
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {numberFormatter.format(row.usedGb)} GB
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {row.limitGb > 0
                                                ? `${numberFormatter.format(row.limitGb)} GB`
                                                : "—"}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {row.limitGb > 0
                                                ? `${row.percent}%`
                                                : "—"}
                                        </td>
                                    </tr>
                                ))}
                                {!loading && rows.length === 0 ? (
                                    <tr>
                                        <td
                                            className="px-5 py-4 text-label-sm text-sub-600"
                                            colSpan={4}
                                        >
                                            No companies yet.
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>
                </section>
                <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                    <h2 className="text-label-lg text-strong-950">
                        Top consumers
                    </h2>
                    <div className="mt-4 space-y-3">
                        {top.map((row) => (
                            <div key={row.id}>
                                <p className="text-label-sm text-strong-950">
                                    {row.name}
                                </p>
                                <p className="text-label-xs text-sub-600">
                                    {numberFormatter.format(row.usedGb)} GB used
                                </p>
                            </div>
                        ))}
                        {!loading && top.length === 0 ? (
                            <p className="text-label-sm text-sub-600">
                                No storage usage yet.
                            </p>
                        ) : null}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default LiveStoragePage;
