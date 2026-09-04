"use client";

import { useEffect, useMemo, useState } from "react";

import { AdminAreaChart, AdminBarChart } from "@/components/Admin/AdminCharts";
import { AdminAnalyticsSkeleton } from "@/components/Skeleton/sections";
import StatCard from "@/components/Admin/StatCard";
import { barsFromNamedValues, type ChartPoint } from "@/lib/admin/dashboardSeries";
import { useAuth } from "@/context/AuthContext";
import { loadUsageSeries, loadWeeklySpend } from "@/lib/coair/admin";
import { useLiveAdmin } from "@/lib/coair/useLiveAdmin";

const numberFormatter = new Intl.NumberFormat("en-US");
const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
});

const LiveAnalyticsPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const { usage, groups, orgs, error, loading } = useLiveAdmin();
    const [weekly, setWeekly] = useState<ChartPoint[]>([]);
    const [weekCalls, setWeekCalls] = useState<ChartPoint[]>([]);
    const [seriesError, setSeriesError] = useState<string | null>(null);

    const usageGroups = groups.map((group) => ({
        label: group.username || group.model || "group",
        calls: group.calls ?? 0,
        cost: group.estimated_provider_cost_usd ?? 0,
    }));
    const tokenBars = barsFromNamedValues(
        usageGroups
            .slice(0, 12)
            .map((group) => ({ name: group.label, value: group.calls }))
    );
    const topSpend = useMemo(
        () =>
            [...usageGroups]
                .sort((a, b) => b.cost - a.cost)
                .slice(0, 8)
                .map((row) => ({
                    name: row.label,
                    value: Number(row.cost.toFixed(2)),
                })),
        [usageGroups]
    );
    const spendBars = barsFromNamedValues(topSpend);
    const activeCompanies = orgs.filter((org) => !org.archived_at).length;

    useEffect(() => {
        if (!token) return;
        void loadUsageSeries(token, 8)
            .then((payload) => {
                setWeekly(
                    (payload.series ?? []).map((row) => ({
                        label: row.label,
                        value: Number((row.cost_usd ?? 0).toFixed(2)),
                    }))
                );
                setWeekCalls(
                    (payload.series ?? []).map((row) => ({
                        label: row.label,
                        value: Number(row.calls ?? 0),
                    }))
                );
                setSeriesError(null);
            })
            .catch(() => {
                void loadWeeklySpend(token)
                    .then((points) => {
                        setWeekly(points);
                        setWeekCalls([]);
                        setSeriesError(null);
                    })
                    .catch(() => {
                        setWeekly([]);
                        setWeekCalls([]);
                        setSeriesError("Could not load weekly series");
                    });
            });
    }, [token]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Analytics</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Live platform spend, call volume, and company activity from
                    the billing ledger.
                </p>
            </div>
            {error || seriesError ? (
                <p className="text-label-sm text-red-500">
                    {error ?? seriesError}
                </p>
            ) : null}
            <AdminAnalyticsSkeleton loading={loading}>
                <>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <StatCard
                            label="Total calls"
                            value={numberFormatter.format(usage?.total_calls ?? 0)}
                            hint="All LLM calls"
                        />
                        <StatCard
                            label="Tokens consumed"
                            value={numberFormatter.format(usage?.total_tokens ?? 0)}
                            hint="Prompt + completion"
                        />
                        <StatCard
                            label="Spend remaining"
                            value={`$${(usage?.remaining_usd ?? 0).toFixed(2)}`}
                            hint={`of $${(usage?.limit_usd ?? 0).toFixed(0)} budget`}
                        />
                        <StatCard
                            label="Active companies"
                            value={numberFormatter.format(activeCompanies)}
                            hint={`${orgs.length} total orgs`}
                        />
                    </div>
                    <div className="grid gap-6 xl:grid-cols-2">
                        {tokenBars.length > 0 ? (
                            <AdminBarChart
                                title="Usage by group"
                                hint="Top call volume by user / model"
                                data={tokenBars}
                            />
                        ) : (
                            <section className="surface-panel p-5">
                                <h2 className="text-label-lg text-strong-950">
                                    Usage by group
                                </h2>
                                <p className="mt-8 text-label-sm text-sub-600">
                                    No live usage groups yet.
                                </p>
                            </section>
                        )}
                        {spendBars.length > 0 ? (
                            <AdminBarChart
                                title="Top spend"
                                hint="Estimated provider cost by group"
                                data={spendBars}
                                valuePrefix="$"
                            />
                        ) : (
                            <section className="surface-panel p-5">
                                <h2 className="text-label-lg text-strong-950">
                                    Top spend
                                </h2>
                                <p className="mt-8 text-label-sm text-sub-600">
                                    No spend groups yet.
                                </p>
                            </section>
                        )}
                        {weekly.some((point) => point.value > 0) ? (
                            <AdminAreaChart
                                title="Weekly spend"
                                hint="Provider cost by week from the ledger"
                                data={weekly}
                                valuePrefix="$"
                                fillId="liveAnalyticsSpendFill"
                            />
                        ) : (
                            <section className="surface-panel p-5">
                                <h2 className="text-label-lg text-strong-950">
                                    Weekly spend
                                </h2>
                                <p className="mt-8 text-label-sm text-sub-600">
                                    No dated spend in the last eight weeks.
                                </p>
                            </section>
                        )}
                        {weekCalls.some((point) => point.value > 0) ? (
                            <AdminAreaChart
                                title="Weekly calls"
                                hint="LLM call count by week"
                                data={weekCalls}
                                fillId="liveAnalyticsCallsFill"
                            />
                        ) : (
                            <section className="surface-panel p-5">
                                <h2 className="text-label-lg text-strong-950">
                                    Weekly calls
                                </h2>
                                <p className="mt-8 text-label-sm text-sub-600">
                                    No dated calls in the last eight weeks.
                                </p>
                            </section>
                        )}
                    </div>
                    {topSpend.length > 0 ? (
                        <section className="surface-panel p-5">
                            <h2 className="text-label-lg text-strong-950">
                                Spend leaders
                            </h2>
                            <div className="mt-4 divide-y divide-stroke-soft-200">
                                {topSpend.map((row) => (
                                    <div
                                        key={row.name}
                                        className="flex items-center justify-between gap-3 py-3 text-label-sm"
                                    >
                                        <span className="text-strong-950">
                                            {row.name}
                                        </span>
                                        <span className="text-sub-600">
                                            {currency.format(row.value)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ) : null}
                </>
            </AdminAnalyticsSkeleton>
        </div>
    );
};

export default LiveAnalyticsPage;
