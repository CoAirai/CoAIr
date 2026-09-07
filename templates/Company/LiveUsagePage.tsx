"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/Admin/PageHeader";
import QuotaBar from "@/components/Admin/QuotaBar";
import { CompanyUsageSkeleton } from "@/components/Skeleton/sections";
import { bytesToGb } from "@/lib/admin/liveHelpers";
import { formatCa, microsToCa } from "@/lib/billing/tokenEconomics";
import { useLiveOrg } from "@/lib/coair/useLiveOrg";
import { useLiveWorkspace } from "@/context/LiveWorkspaceContext";
import { readOrgTokenPool, type CoairTokenPool } from "@/lib/coair/org";
import { useAuth } from "@/context/AuthContext";

const numberFormatter = new Intl.NumberFormat("en-US");

const LiveUsagePage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const { me, orgUsage, users, error } = useLiveOrg();
    const { accountUsage } = useLiveWorkspace();
    const usage = accountUsage ?? me;
    const used = usage?.used_tokens ?? 0;
    const limit = usage?.token_limit ?? 0;
    const remaining = Math.max(0, limit - used);
    const storageUsed = bytesToGb(usage?.storage_used_bytes);
    const storageLimit = bytesToGb(usage?.storage_limit_bytes);
    const totals = orgUsage?.totals;
    const groups = orgUsage?.groups?.slice(0, 8) ?? [];
    const geminiConsumed =
        (totals?.prompt_tokens ?? 0) + (totals?.completion_tokens ?? 0);
    const caFromSpend = totals?.provider_cost_usd ?? totals?.cost_usd;
    const [pool, setPool] = useState<CoairTokenPool | null>(null);

    useEffect(() => {
        if (!token) return;
        void readOrgTokenPool(token)
            .then(setPool)
            .catch(() => setPool(null));
    }, [token, users]);

    return (
        <div className="page-stack">
            <PageHeader
                title="Usage"
                description="Company CA token pool, equal shares, and storage."
            />
            {error ? (
                <p className="text-label-sm text-red-500">{error}</p>
            ) : null}
            <CompanyUsageSkeleton loading={pool === null && !error}>
                <div className="space-y-6">
                    {pool ? (
                        <section className="surface-panel p-5">
                            <h2 className="text-label-lg text-strong-950">
                                Company CA token pool
                            </h2>
                            <p className="mt-1 text-label-xs text-sub-600">
                                Package pool is split equally across active
                                members. Equal share snapshot:{" "}
                                {formatCa(pool.equal_share)} CA each (
                                {pool.member_count} members).
                            </p>
                            <div className="mt-4 grid gap-4 sm:grid-cols-3">
                                <div>
                                    <p className="text-label-xs text-sub-600">
                                        Pool (CA)
                                    </p>
                                    <p className="mt-1 text-label-lg text-strong-950 tabular-nums">
                                        {formatCa(pool.pool)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-label-xs text-sub-600">
                                        Company used (CA)
                                    </p>
                                    <p className="mt-1 text-label-lg text-strong-950 tabular-nums">
                                        {formatCa(pool.total_used)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-label-xs text-sub-600">
                                        Company remaining (CA)
                                    </p>
                                    <p className="mt-1 text-label-lg text-strong-950 tabular-nums">
                                        {formatCa(pool.remaining)}
                                    </p>
                                </div>
                            </div>
                            <QuotaBar
                                label="Company pool used"
                                used={microsToCa(pool.total_used)}
                                limit={microsToCa(pool.pool) || 1}
                            />
                            {pool.members.length > 0 ? (
                                <ul className="mt-4 divide-y divide-stroke-soft-200">
                                    {pool.members.map((member) => (
                                        <li
                                            key={member.username}
                                            className="flex items-center justify-between py-2 text-label-sm"
                                        >
                                            <span className="text-strong-950">
                                                {member.display_name ||
                                                    member.username}
                                            </span>
                                            <span className="text-sub-600 tabular-nums">
                                                {formatCa(member.used_tokens)} /{" "}
                                                {formatCa(member.token_limit)} ·{" "}
                                                {formatCa(member.remaining)} left
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </section>
                    ) : null}
                    <section className="grid gap-4 md:grid-cols-2">
                        <div className="surface-panel p-5">
                            <p className="text-label-xs text-sub-600">
                                Your CA tokens
                            </p>
                            <p className="mt-1 text-label-xl text-strong-950">
                                {formatCa(used)} / {formatCa(limit)}
                            </p>
                            <p className="mt-1 text-label-xs text-sub-600">
                                {formatCa(remaining)} remaining
                            </p>
                            <QuotaBar
                                label="CA tokens used"
                                used={microsToCa(used)}
                                limit={microsToCa(limit) || 1}
                            />
                        </div>
                        <div className="surface-panel p-5">
                            <p className="text-label-xs text-sub-600">Storage</p>
                            <p className="mt-1 text-label-xl text-strong-950">
                                {storageUsed.toFixed(2)} GB /{" "}
                                {storageLimit.toFixed(0)} GB
                            </p>
                            <QuotaBar
                                label="Storage used"
                                used={storageUsed}
                                limit={storageLimit || 1}
                                unit="GB"
                            />
                        </div>
                    </section>
                    <section className="surface-panel p-5">
                        <h2 className="text-label-lg text-strong-950">
                            Company spend
                        </h2>
                        <p className="mt-1 text-label-xs text-sub-600">
                            Aggregated usage across company projects.
                        </p>
                        <div className="mt-4 grid gap-4 sm:grid-cols-3">
                            <div>
                                <p className="text-label-xs text-sub-600">Calls</p>
                                <p className="mt-1 text-label-lg text-strong-950">
                                    {numberFormatter.format(totals?.calls ?? 0)}
                                </p>
                            </div>
                            <div>
                                <p className="text-label-xs text-sub-600">
                                    Gemini prompt
                                </p>
                                <p className="mt-1 text-label-lg text-strong-950">
                                    {numberFormatter.format(
                                        totals?.prompt_tokens ?? 0
                                    )}
                                </p>
                            </div>
                            <div>
                                <p className="text-label-xs text-sub-600">
                                    Gemini completion
                                </p>
                                <p className="mt-1 text-label-lg text-strong-950">
                                    {numberFormatter.format(
                                        totals?.completion_tokens ?? 0
                                    )}
                                </p>
                            </div>
                        </div>
                        <p className="mt-3 text-label-sm text-sub-600">
                            Total Gemini tokens:{" "}
                            <span className="text-strong-950">
                                {numberFormatter.format(geminiConsumed)}
                            </span>
                            {caFromSpend != null ? (
                                <>
                                    {" "}
                                    · CA used ≈{" "}
                                    <span className="text-strong-950">
                                        {numberFormatter.format(
                                            Number(caFromSpend)
                                        )}
                                    </span>
                                </>
                            ) : null}
                        </p>
                        {groups.length > 0 ? (
                            <ul className="mt-4 divide-y divide-stroke-soft-200">
                                {groups.map((group, index) => (
                                    <li
                                        key={`${group.project_id}-${group.username}-${index}`}
                                        className="flex items-center justify-between py-2 text-label-sm"
                                    >
                                        <span className="text-strong-950">
                                            {group.username ||
                                                group.model ||
                                                "group"}
                                        </span>
                                        <span className="text-sub-600 tabular-nums">
                                            {numberFormatter.format(
                                                (group.prompt_tokens ?? 0) +
                                                    (group.completion_tokens ?? 0)
                                            )}{" "}
                                            Gemini ·{" "}
                                            {numberFormatter.format(
                                                group.calls ?? 0
                                            )}{" "}
                                            calls
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </section>
                </div>
            </CompanyUsageSkeleton>
        </div>
    );
};

export default LiveUsagePage;
