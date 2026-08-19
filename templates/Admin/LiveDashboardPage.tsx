"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AdminAreaChart, AdminBarChart } from "@/components/Admin/AdminCharts";
import PageEnter from "@/components/Motion/PageEnter";
import PageHeader from "@/components/Admin/PageHeader";
import QuotaBar from "@/components/Admin/QuotaBar";
import StatCard from "@/components/Admin/StatCard";
import StatusBadge from "@/components/Admin/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { formatAuditHeadline } from "@/lib/admin/auditLabels";
import { barsFromNamedValues, type ChartPoint } from "@/lib/admin/dashboardSeries";
import type { AuditEntry } from "@/lib/admin/types";
import { bytesToGb, planLabel } from "@/lib/admin/liveHelpers";
import { loadWeeklySpend } from "@/lib/coair/admin";
import { listAudit } from "@/lib/coair/ops";
import { useLiveAdmin } from "@/lib/coair/useLiveAdmin";

const numberFormatter = new Intl.NumberFormat("en-US");
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
});

const LiveDashboardPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const { orgs, users, usage, groups, loading, error } = useLiveAdmin();
    const [audit, setAudit] = useState<AuditEntry[]>([]);
    const [auditReady, setAuditReady] = useState(false);
    const [weekly, setWeekly] = useState<ChartPoint[]>([]);

    useEffect(() => {
        if (!token) return;
        setAuditReady(false);
        void listAudit(token)
            .then((events) => {
                setAudit(events);
                setAuditReady(true);
            })
            .catch(() => {
                setAudit([]);
                setAuditReady(true);
            });
        void loadWeeklySpend(token).then(setWeekly).catch(() => setWeekly([]));
    }, [token]);

    const activeUsers = users.filter((user) => user.is_active !== false).length;

    const usageRows = useMemo(() => {
        const tokensByOrg = new Map<string, { used: number; limit: number }>();
        for (const user of users) {
            const orgId = user.org_id ?? "";
            const current = tokensByOrg.get(orgId) ?? { used: 0, limit: 0 };
            current.used += user.used_tokens ?? 0;
            current.limit += user.token_limit ?? 0;
            tokensByOrg.set(orgId, current);
        }
        return orgs.map((org) => {
            const tokens = tokensByOrg.get(org.org_id);
            const tokenLimit =
                tokens?.limit || org.default_token_limit || 0;
            const tokensUsed = tokens?.used ?? 0;
            const members = users.filter((user) => user.org_id === org.org_id);
            const storageUsed = bytesToGb(
                members.reduce(
                    (sum, user) => sum + (user.storage_used_bytes ?? 0),
                    0
                )
            );
            const storageLimit = bytesToGb(
                members.reduce(
                    (sum, user) => sum + (user.storage_limit_bytes ?? 0),
                    0
                ) || org.default_storage_bytes
            );
            return {
                id: org.org_id,
                name: org.name,
                planName: planLabel(org.default_plan_type),
                storageUsed,
                storageLimit,
                tokensUsed,
                tokenLimit,
                tokensRemaining: Math.max(0, tokenLimit - tokensUsed),
                status: org.archived_at ? "suspended" : "active",
            };
        });
    }, [orgs, users]);

    const tokenTotals = useMemo(
        () =>
            usageRows.reduce(
                (acc, row) => {
                    acc.used += row.tokensUsed;
                    acc.limit += row.tokenLimit;
                    return acc;
                },
                { used: 0, limit: 0 }
            ),
        [usageRows]
    );

    const tokenBars = useMemo(() => {
        if (groups.length > 0) {
            return barsFromNamedValues(
                groups.map((group) => ({
                    name: group.username || group.model || "group",
                    value: group.calls ?? 0,
                }))
            );
        }
        return barsFromNamedValues(
            usageRows.map((row) => ({
                name: row.name,
                value: row.tokensUsed,
            }))
        );
    }, [groups, usageRows]);

    return (
        <PageEnter className="page-stack">
            <PageHeader
                title="Dashboard"
                description="Live companies, users, and spend from the API."
            />
            {error ? (
                <p className="text-label-sm text-red-500">{error}</p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="Companies"
                    value={numberFormatter.format(orgs.length)}
                    hint={loading ? "Loading…" : "Organizations"}
                />
                <StatCard
                    label="Users"
                    value={numberFormatter.format(users.length)}
                    hint={`${activeUsers} active`}
                />
                <StatCard
                    label="LLM calls"
                    value={numberFormatter.format(usage?.total_calls ?? 0)}
                    hint="All accounts"
                />
                <StatCard
                    label="Budget remaining"
                    value={`$${(usage?.remaining_usd ?? 0).toFixed(2)}`}
                    hint={`of $${(usage?.limit_usd ?? 0).toFixed(0)}`}
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                {weekly.some((point) => point.value > 0) ? (
                    <AdminAreaChart
                        title="Weekly spend"
                        hint="Live estimated provider cost from the ledger"
                        data={weekly}
                        valuePrefix="$"
                        fillId="liveDashSpendFill"
                    />
                ) : (
                    <section className="surface-panel p-5">
                        <h2 className="text-label-lg text-strong-950">
                            Weekly spend
                        </h2>
                        <p className="mt-8 text-label-sm text-sub-600">
                            {loading
                                ? "Loading usage…"
                                : "No dated spend in the last eight weeks."}
                        </p>
                    </section>
                )}
                {tokenBars.length > 0 ? (
                    <AdminBarChart
                        title={
                            groups.length > 0
                                ? "Calls by group"
                                : "Tokens by company"
                        }
                        hint="Current period from the API"
                        data={tokenBars}
                    />
                ) : (
                    <section className="surface-panel p-5">
                        <h2 className="text-label-lg text-strong-950">
                            Tokens by company
                        </h2>
                        <p className="mt-8 text-label-sm text-sub-600">
                            {loading
                                ? "Loading companies…"
                                : "No live token usage yet."}
                        </p>
                    </section>
                )}
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
                <section className="surface-panel overflow-hidden">
                    <div className="surface-panel-header flex items-center justify-between gap-4">
                        <div>
                            <h2 className="text-label-lg text-strong-950">
                                Company usage
                            </h2>
                            <p className="mt-1 text-label-xs text-sub-600">
                                Live organizations and remaining token quota
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
                                    <th>Company</th>
                                    <th>Plan</th>
                                    <th>Storage</th>
                                    <th>Tokens remaining</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stroke-soft-200">
                                {loading && usageRows.length === 0 ? (
                                    <tr>
                                        <td
                                            className="px-5 py-4 text-label-sm text-sub-600"
                                            colSpan={5}
                                        >
                                            Loading companies…
                                        </td>
                                    </tr>
                                ) : null}
                                {usageRows.map((row) => (
                                    <tr key={row.id} className="text-label-sm">
                                        <td className="px-5 py-4">
                                            <Link
                                                href={`/admin/companies/${row.id}`}
                                                className="text-strong-950 hover:text-blue-500"
                                            >
                                                {row.name}
                                            </Link>
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {row.planName}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {numberFormatter.format(
                                                row.storageUsed
                                            )}
                                            {row.storageLimit > 0
                                                ? ` / ${numberFormatter.format(row.storageLimit)} GB`
                                                : " GB"}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {numberFormatter.format(
                                                row.tokensRemaining
                                            )}
                                        </td>
                                        <td className="px-5 py-4">
                                            <StatusBadge
                                                status={
                                                    row.status === "suspended"
                                                        ? "suspended"
                                                        : "active"
                                                }
                                            />
                                        </td>
                                    </tr>
                                ))}
                                {!loading && usageRows.length === 0 ? (
                                    <tr>
                                        <td
                                            className="px-5 py-4 text-label-sm text-sub-600"
                                            colSpan={5}
                                        >
                                            No companies yet.
                                        </td>
                                    </tr>
                                ) : null}
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
                                Latest admin and tenant actions
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
                        {!auditReady ? (
                            <p className="py-2 text-label-sm text-sub-600">
                                Loading activity…
                            </p>
                        ) : audit.length === 0 ? (
                            <p className="py-2 text-label-sm text-sub-600">
                                No admin actions yet.
                            </p>
                        ) : (
                            audit.slice(0, 8).map((entry) => (
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
                <h2 className="text-label-lg text-strong-950">
                    Platform allocation
                </h2>
                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                    <QuotaBar
                        label="Budget"
                        used={usage?.used_usd ?? 0}
                        limit={usage?.limit_usd ?? 0}
                        unit="USD"
                    />
                    <QuotaBar
                        label="Tokens"
                        used={tokenTotals.used}
                        limit={tokenTotals.limit}
                    />
                </div>
            </section>
        </PageEnter>
    );
};

export default LiveDashboardPage;
