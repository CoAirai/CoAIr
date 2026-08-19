"use client";

import PageHeader from "@/components/Admin/PageHeader";
import QuotaBar from "@/components/Admin/QuotaBar";
import { bytesToGb } from "@/lib/admin/liveHelpers";
import { useLiveOrg } from "@/lib/coair/useLiveOrg";
import { useLiveWorkspace } from "@/context/LiveWorkspaceContext";

const numberFormatter = new Intl.NumberFormat("en-US");

const LiveUsagePage = () => {
    const { me, orgUsage, error } = useLiveOrg();
    const { accountUsage } = useLiveWorkspace();
    const usage = accountUsage ?? me;
    const used = usage?.used_tokens ?? 0;
    const limit = usage?.token_limit ?? 0;
    const credits = usage?.credits_remaining ?? 0;
    const creditsTotal = usage?.credits_total ?? 0;
    const storageUsed = bytesToGb(usage?.storage_used_bytes);
    const storageLimit = bytesToGb(usage?.storage_limit_bytes);
    const totals = orgUsage?.totals;
    const groups = orgUsage?.groups?.slice(0, 8) ?? [];

    return (
        <div className="page-stack">
            <PageHeader
                title="Usage"
                description="Live credits, tokens, and storage from this account. Token-share editing stays on mock companies until the API supports it."
            />
            {error ? (
                <p className="text-label-sm text-red-500">{error}</p>
            ) : null}
            <section className="grid gap-4 md:grid-cols-2">
                <div className="surface-panel p-5">
                    <p className="text-label-xs text-sub-600">Tokens</p>
                    <p className="mt-1 text-label-xl text-strong-950">
                        {numberFormatter.format(used)} / {numberFormatter.format(limit)}
                    </p>
                    <QuotaBar
                        label="Tokens used"
                        used={used}
                        limit={limit || 1}
                    />
                </div>
                <div className="surface-panel p-5">
                    <p className="text-label-xs text-sub-600">Credits</p>
                    <p className="mt-1 text-label-xl text-strong-950">
                        {numberFormatter.format(credits)} remaining of{" "}
                        {numberFormatter.format(creditsTotal)}
                    </p>
                </div>
                <div className="surface-panel p-5 md:col-span-2">
                    <p className="text-label-xs text-sub-600">Storage</p>
                    <p className="mt-1 text-label-xl text-strong-950">
                        {storageUsed.toFixed(2)} GB / {storageLimit.toFixed(0)} GB
                    </p>
                </div>
            </section>
            <section className="surface-panel p-5">
                <h2 className="text-label-lg text-strong-950">Company spend</h2>
                <p className="mt-1 text-label-xs text-sub-600">
                    From GET /org/usage. Token-share editing stays on mock
                    companies until the API supports it.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div>
                        <p className="text-label-xs text-sub-600">Calls</p>
                        <p className="mt-1 text-label-lg text-strong-950">
                            {numberFormatter.format(totals?.calls ?? 0)}
                        </p>
                    </div>
                    <div>
                        <p className="text-label-xs text-sub-600">Prompt tokens</p>
                        <p className="mt-1 text-label-lg text-strong-950">
                            {numberFormatter.format(totals?.prompt_tokens ?? 0)}
                        </p>
                    </div>
                    <div>
                        <p className="text-label-xs text-sub-600">Credits used</p>
                        <p className="mt-1 text-label-lg text-strong-950">
                            {(totals?.credits_used ?? 0).toFixed(2)}
                        </p>
                    </div>
                </div>
                {groups.length > 0 ? (
                    <ul className="mt-4 divide-y divide-stroke-soft-200">
                        {groups.map((group, index) => (
                            <li
                                key={`${group.project_id}-${group.username}-${index}`}
                                className="flex items-center justify-between py-2 text-label-sm"
                            >
                                <span className="text-strong-950">
                                    {group.username || group.model || "group"}
                                </span>
                                <span className="text-sub-600 tabular-nums">
                                    {numberFormatter.format(group.calls ?? 0)} calls
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : null}
            </section>
        </div>
    );
};

export default LiveUsagePage;
