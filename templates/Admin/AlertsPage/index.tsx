"use client";

import { useMemo, useState } from "react";

import { QUOTA_ALERTS } from "@/lib/admin/billingDemoData";
import { acknowledgeAlert } from "@/lib/admin/billingSelectors";
import type { QuotaAlertKind } from "@/lib/admin/billingTypes";
import { COMPANIES } from "@/lib/admin/demoData";

type AcknowledgementFilter = "all" | "unacked";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
});

const companyNameById = Object.fromEntries(
    COMPANIES.map((company) => [company.id, company.name])
);

const thresholdStyles = {
    80: "border-blue-200 bg-blue-50",
    90: "border-orange-200 bg-orange-50",
    100: "border-red-500 bg-red-50",
} as const;

const AlertsPage = () => {
    const [alerts, setAlerts] = useState(QUOTA_ALERTS);
    const [acknowledgement, setAcknowledgement] =
        useState<AcknowledgementFilter>("all");
    const [kind, setKind] = useState<QuotaAlertKind | "all">("all");

    const filteredAlerts = useMemo(
        () =>
            alerts.filter((alert) => {
                if (acknowledgement === "unacked" && alert.acknowledged) {
                    return false;
                }

                return kind === "all" || alert.kind === kind;
            }),
        [acknowledgement, alerts, kind]
    );

    const handleAcknowledge = (id: string) => {
        setAlerts((current) => acknowledgeAlert(current, id));
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Quota alerts</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Review token and storage thresholds across companies.
                </p>
            </div>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="grid gap-3 border-b border-stroke-soft-200 p-5 sm:grid-cols-2">
                    <label className="block">
                        <span className="mb-2 block text-label-xs text-sub-600">
                            Acknowledgement
                        </span>
                        <select
                            value={acknowledgement}
                            onChange={(event) =>
                                setAcknowledgement(
                                    event.target.value as AcknowledgementFilter
                                )
                            }
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-label-sm text-strong-950 outline-none focus:border-blue-500"
                        >
                            <option value="all">All alerts</option>
                            <option value="unacked">Unacknowledged</option>
                        </select>
                    </label>

                    <label className="block">
                        <span className="mb-2 block text-label-xs text-sub-600">
                            Quota kind
                        </span>
                        <select
                            value={kind}
                            onChange={(event) =>
                                setKind(event.target.value as QuotaAlertKind | "all")
                            }
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-label-sm text-strong-950 outline-none focus:border-blue-500"
                        >
                            <option value="all">All kinds</option>
                            <option value="tokens">Tokens</option>
                            <option value="storage">Storage</option>
                        </select>
                    </label>
                </div>

                <div className="space-y-3 p-5">
                    {filteredAlerts.map((alert) => (
                        <article
                            key={alert.id}
                            className={`flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${thresholdStyles[alert.thresholdPct]}`}
                        >
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-label-sm text-strong-950">
                                        {alert.message}
                                    </p>
                                    <span className="rounded-full bg-white-0 px-2 py-1 text-label-xs capitalize text-sub-600">
                                        {alert.kind}
                                    </span>
                                    <span className="rounded-full bg-white-0 px-2 py-1 text-label-xs text-sub-600">
                                        {alert.thresholdPct}% threshold
                                    </span>
                                </div>
                                <p className="mt-2 text-label-xs text-sub-600">
                                    {companyNameById[alert.companyId] ?? "Unknown"} ·{" "}
                                    {dateFormatter.format(new Date(alert.createdAt))}
                                </p>
                            </div>

                            {alert.acknowledged ? (
                                <span className="shrink-0 text-label-xs text-sub-600">
                                    Acknowledged
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => handleAcknowledge(alert.id)}
                                    className="h-9 shrink-0 rounded-xl bg-blue-500 px-3 text-label-sm text-white-0 hover:bg-blue-600"
                                >
                                    Acknowledge
                                </button>
                            )}
                        </article>
                    ))}

                    {filteredAlerts.length === 0 && (
                        <div className="py-10 text-center">
                            <p className="text-label-sm text-strong-950">
                                No alerts found
                            </p>
                            <p className="mt-1 text-label-xs text-sub-600">
                                Try changing the selected filters.
                            </p>
                        </div>
                    )}
                </div>

                <div className="border-t border-stroke-soft-200 px-5 py-3 text-label-xs text-sub-600">
                    Showing {filteredAlerts.length} of {alerts.length} alerts
                </div>
            </section>
        </div>
    );
};

export default AlertsPage;
