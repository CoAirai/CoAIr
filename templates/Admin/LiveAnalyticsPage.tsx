"use client";

import { useEffect, useState } from "react";

import { AdminAreaChart, AdminBarChart } from "@/components/Admin/AdminCharts";
import StatCard from "@/components/Admin/StatCard";
import { barsFromNamedValues, type ChartPoint } from "@/lib/admin/dashboardSeries";
import { useAuth } from "@/context/AuthContext";
import { loadWeeklySpend } from "@/lib/coair/admin";
import { useLiveAdmin } from "@/lib/coair/useLiveAdmin";

const numberFormatter = new Intl.NumberFormat("en-US");

const LiveAnalyticsPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const { usage, groups, error, loading } = useLiveAdmin();
    const [weekly, setWeekly] = useState<ChartPoint[]>([]);
    const usageGroups = groups.map((group) => ({
        label: group.username || group.model || "group",
        calls: group.calls ?? 0,
    }));
    const tokenBars = barsFromNamedValues(
        usageGroups.map((group) => ({ name: group.label, value: group.calls }))
    );

    useEffect(() => {
        if (!token) return;
        void loadWeeklySpend(token).then(setWeekly).catch(() => setWeekly([]));
    }, [token]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Analytics</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Live platform spend and call volume from the API.
                </p>
            </div>
            {error ? (
                <p className="text-label-sm text-red-500">{error}</p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <StatCard
                    label="Total calls"
                    value={numberFormatter.format(usage?.total_calls ?? 0)}
                    hint={loading ? "Loading…" : "All LLM calls"}
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
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
                {tokenBars.length > 0 ? (
                    <AdminBarChart
                        title="Usage by group"
                        hint="Calls by project, user, or tenant"
                        data={tokenBars}
                    />
                ) : (
                    <section className="surface-panel p-5">
                        <h2 className="text-label-lg text-strong-950">
                            Usage by group
                        </h2>
                        <p className="mt-8 text-label-sm text-sub-600">
                            {loading
                                ? "Loading usage…"
                                : "No live usage groups yet."}
                        </p>
                    </section>
                )}
                {weekly.some((point) => point.value > 0) ? (
                    <AdminAreaChart
                        title="Weekly spend"
                        hint="Estimated provider cost by week from the ledger"
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
                            {loading
                                ? "Loading usage…"
                                : "No dated spend in the last eight weeks."}
                        </p>
                    </section>
                )}
            </div>
        </div>
    );
};

export default LiveAnalyticsPage;
