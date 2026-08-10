"use client";

import QuotaBar from "@/components/Admin/QuotaBar";
import StatCard from "@/components/Admin/StatCard";
import { useCompanyData } from "@/context/CompanyDataContext";
import { getPlanById } from "@/lib/admin/plans";
import {
    getStorageRemaining,
    getTokensRemaining,
} from "@/lib/admin/selectors";

const numberFormatter = new Intl.NumberFormat("en-US");
const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
});

const DashboardPage = () => {
    const { company, users, overflowTokens, activity, plans } = useCompanyData();
    const plan = getPlanById(company.planId, plans);
    const tokensRemaining = getTokensRemaining(company);
    const storageRemaining = getStorageRemaining(company);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Dashboard</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Plan, team size, and quota overview for {company.name}.
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <StatCard
                    label="Plan"
                    value={plan?.name ?? "Unknown"}
                    hint={`${company.status.charAt(0).toUpperCase()}${company.status.slice(1)} account`}
                />
                <StatCard
                    label="Team members"
                    value={numberFormatter.format(users.length)}
                    hint={`${users.filter((u) => u.status === "active").length} active`}
                />
                <StatCard
                    label="Tokens remaining"
                    value={numberFormatter.format(tokensRemaining)}
                    hint={`of ${numberFormatter.format(company.tokenLimit)} allocated`}
                />
                <StatCard
                    label="Storage remaining"
                    value={`${numberFormatter.format(storageRemaining)} GB`}
                    hint={`of ${numberFormatter.format(company.storageLimitGb)} GB allocated`}
                />
                <StatCard
                    label="Overflow pool"
                    value={numberFormatter.format(overflowTokens)}
                    hint="Released from under-used slices"
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
                <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                    <h2 className="text-label-lg text-strong-950">
                        Quota usage
                    </h2>
                    <div className="mt-5 grid gap-5 lg:grid-cols-2">
                        <QuotaBar
                            label="Tokens"
                            used={company.tokensUsed}
                            limit={company.tokenLimit}
                        />
                        <QuotaBar
                            label="Storage"
                            used={company.storageUsedGb}
                            limit={company.storageLimitGb}
                            unit="GB"
                        />
                    </div>
                </section>

                <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                    <h2 className="text-label-lg text-strong-950">
                        Recent activity
                    </h2>
                    {activity.length === 0 ? (
                        <p className="mt-4 text-label-sm text-sub-600">
                            No activity yet.
                        </p>
                    ) : (
                        <div className="mt-4 divide-y divide-stroke-soft-200">
                            {activity.slice(0, 8).map((item) => (
                                <div
                                    key={item.id}
                                    className="py-4 first:pt-0 last:pb-0"
                                >
                                    <p className="text-label-sm text-strong-950">
                                        {item.text}
                                    </p>
                                    <p className="mt-1 text-label-xs text-sub-600">
                                        {dateFormatter.format(new Date(item.at))}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default DashboardPage;
