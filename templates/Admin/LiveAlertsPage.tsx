"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { bytesToGb } from "@/lib/admin/liveHelpers";
import { usagePercent } from "@/lib/admin/adminSelectors";
import { useLiveAdmin } from "@/lib/coair/useLiveAdmin";

type Kind = "tokens" | "storage";
type Threshold = 80 | 90 | 100;

type LiveAlert = {
    id: string;
    companyId: string;
    companyName: string;
    kind: Kind;
    threshold: Threshold;
    percent: number;
    message: string;
};

const LiveAlertsPage = () => {
    const { orgs, users, loading, error } = useLiveAdmin();
    const [kind, setKind] = useState<Kind | "all">("all");
    const [acked, setAcked] = useState<Set<string>>(new Set());

    const alerts = useMemo(() => {
        const rows: LiveAlert[] = [];
        for (const org of orgs) {
            const members = users.filter((user) => user.org_id === org.org_id);
            const tokensUsed = members.reduce(
                (sum, user) => sum + (user.used_tokens ?? 0),
                0
            );
            const tokenLimit =
                members.reduce(
                    (sum, user) => sum + (user.token_limit ?? 0),
                    0
                ) || org.default_token_limit || 0;
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
                ) || org.default_storage_bytes || 0
            );
            const tokenPct = usagePercent(tokensUsed, tokenLimit);
            const storagePct = usagePercent(storageUsed, storageLimit);
            const push = (kindValue: Kind, percent: number) => {
                const threshold: Threshold =
                    percent >= 100 ? 100 : percent >= 90 ? 90 : 80;
                if (percent < 80) return;
                rows.push({
                    id: `${org.org_id}-${kindValue}`,
                    companyId: org.org_id,
                    companyName: org.name,
                    kind: kindValue,
                    threshold,
                    percent,
                    message: `${org.name} is at ${percent}% of its ${kindValue} quota`,
                });
            };
            push("tokens", tokenPct);
            push("storage", storagePct);
        }
        return rows.sort((a, b) => b.percent - a.percent);
    }, [orgs, users]);

    const visible = alerts.filter((alert) => {
        if (acked.has(alert.id)) return false;
        return kind === "all" || alert.kind === kind;
    });

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Quota alerts</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Live token and storage thresholds. Acknowledge is session-only
                    — the API does not store alert state.
                </p>
            </div>
            {error ? (
                <p className="text-label-sm text-red-500">{error}</p>
            ) : null}
            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 p-5">
                    <select
                        value={kind}
                        onChange={(event) =>
                            setKind(event.target.value as Kind | "all")
                        }
                        className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                    >
                        <option value="all">All kinds</option>
                        <option value="tokens">Tokens</option>
                        <option value="storage">Storage</option>
                    </select>
                </div>
                <div className="divide-y divide-stroke-soft-200">
                    {loading && alerts.length === 0 ? (
                        <p className="px-5 py-8 text-label-sm text-sub-600">
                            Loading quotas…
                        </p>
                    ) : null}
                    {visible.map((alert) => (
                        <div
                            key={alert.id}
                            className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"
                        >
                            <div>
                                <Link
                                    href={`/admin/companies/${alert.companyId}`}
                                    className="text-label-sm text-strong-950 hover:text-blue-500"
                                >
                                    {alert.companyName}
                                </Link>
                                <p className="mt-1 text-label-sm text-sub-600">
                                    {alert.message}
                                </p>
                                <p className="mt-1 text-label-xs text-sub-600">
                                    {alert.kind} · {alert.threshold}% threshold
                                </p>
                            </div>
                            <button
                                type="button"
                                className="h-9 rounded-xl border border-stroke-soft-200 px-3 text-label-sm"
                                onClick={() =>
                                    setAcked((current) => new Set(current).add(alert.id))
                                }
                            >
                                Acknowledge
                            </button>
                        </div>
                    ))}
                    {!loading && visible.length === 0 ? (
                        <p className="px-5 py-8 text-label-sm text-sub-600">
                            No companies are at or above 80% of quota.
                        </p>
                    ) : null}
                </div>
            </section>
        </div>
    );
};

export default LiveAlertsPage;
