"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import PageHeader from "@/components/Admin/PageHeader";
import StatusBadge from "@/components/Admin/StatusBadge";
import { bytesToGb, planLabel } from "@/lib/admin/liveHelpers";
import type { CompanyStatus } from "@/lib/admin/types";
import { createAdminOrg } from "@/lib/coair/admin";
import { apiErrorMessage } from "@/lib/coair/commerce";
import { useAuth } from "@/context/AuthContext";
import { useLiveAdmin } from "@/lib/coair/useLiveAdmin";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const numberFormatter = new Intl.NumberFormat("en-US");

type CompanyRow = {
    id: string;
    name: string;
    slug: string;
    members: string | number;
    projects: string | number;
    planName: string;
    storageUsed: number;
    storageLimit: number;
    tokensUsed: number;
    tokenLimit: number;
    status: CompanyStatus;
    created: string;
    renews: string;
    autoRenew: boolean;
};

const LiveCompaniesPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const { orgs, users, loading, error, refresh } = useLiveAdmin();
    const [name, setName] = useState("");
    const [owner, setOwner] = useState("");
    const [planType, setPlanType] = useState<"demo" | "legacy">("demo");
    const [createError, setCreateError] = useState<string | null>(null);
    const [createSuccess, setCreateSuccess] = useState<string | null>(null);
    const tokensByOrg = new Map<
        string,
        { used: number; limit: number; storageUsed: number; storageLimit: number }
    >();
    for (const user of users) {
        const orgId = user.org_id ?? "";
        const current = tokensByOrg.get(orgId) ?? {
            used: 0,
            limit: 0,
            storageUsed: 0,
            storageLimit: 0,
        };
        current.used += user.used_tokens ?? 0;
        current.limit += user.token_limit ?? 0;
        current.storageUsed += user.storage_used_bytes ?? 0;
        current.storageLimit += user.storage_limit_bytes ?? 0;
        tokensByOrg.set(orgId, current);
    }
    const rows: CompanyRow[] = orgs.map((org) => {
        const tokens = tokensByOrg.get(org.org_id);
        const tokenLimit =
            tokens?.limit ||
            org.default_token_limit ||
            0;
        const planId =
            org.subscription?.plan_id || org.default_plan_type;
        const subStatus = org.subscription?.status;
        let status: CompanyStatus = org.archived_at
            ? "suspended"
            : "active";
        if (!org.archived_at && subStatus === "canceled") {
            status = "suspended";
        }
        return {
            id: org.org_id,
            name: org.name,
            slug: org.slug ?? org.org_id.slice(0, 8),
            members: org.counts?.members ?? "—",
            projects: org.counts?.projects ?? "—",
            planName: planLabel(planId),
            storageUsed: bytesToGb(tokens?.storageUsed),
            storageLimit: bytesToGb(
                tokens?.storageLimit || org.default_storage_bytes
            ),
            tokensUsed: tokens?.used ?? 0,
            tokenLimit,
            status,
            created: org.created_at
                ? dateFormatter.format(new Date(org.created_at))
                : "—",
            renews: org.subscription?.current_period_end
                ? dateFormatter.format(
                      new Date(org.subscription.current_period_end)
                  )
                : "—",
            autoRenew: Boolean(org.subscription?.auto_renew),
        };
    });

    return (
        <div className="space-y-6">
            <PageHeader
                title="Companies"
                description="Create a company and invite its owner. They set a password from the email, then invite their own team."
            />
            {error ? (
                <p className="text-label-sm text-red-500">{error}</p>
            ) : null}
            {createError ? (
                <p className="text-label-sm text-red-500">{createError}</p>
            ) : null}
            {createSuccess ? (
                <p className="text-label-sm text-green-600">{createSuccess}</p>
            ) : null}

            <form
                onSubmit={async (event: FormEvent) => {
                    event.preventDefault();
                    try {
                        await createAdminOrg(token, {
                            name: name.trim(),
                            owner_email: owner.trim(),
                            default_plan_type: planType,
                        });
                        setName("");
                        setOwner("");
                        setCreateError(null);
                        setCreateSuccess(
                            `Company created. Invite sent to ${owner.trim()}.`
                        );
                        await refresh();
                    } catch (err) {
                        setCreateSuccess(null);
                        setCreateError(apiErrorMessage(err));
                    }
                }}
                className="grid gap-3 rounded-2xl border border-stroke-soft-200 bg-white-0 p-5 md:grid-cols-[minmax(0,1fr)_minmax(220px,1fr)_140px_auto]"
            >
                <input
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Company name"
                    className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                />
                <input
                    required
                    type="email"
                    value={owner}
                    onChange={(event) => setOwner(event.target.value)}
                    placeholder="Owner email"
                    className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                />
                <select
                    value={planType}
                    onChange={(event) =>
                        setPlanType(event.target.value as "demo" | "legacy")
                    }
                    className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                >
                    <option value="demo">Demo</option>
                    <option value="legacy">Legacy</option>
                </select>
                <button
                    type="submit"
                    className="h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0"
                >
                    Create company
                </button>
            </form>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1100px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">Name</th>
                                <th className="px-5 py-3 font-medium">Slug</th>
                                <th className="px-5 py-3 font-medium">Plan</th>
                                <th className="px-5 py-3 font-medium">Members</th>
                                <th className="px-5 py-3 font-medium">Storage</th>
                                <th className="px-5 py-3 font-medium">Tokens</th>
                                <th className="px-5 py-3 font-medium">Status</th>
                                <th className="px-5 py-3 font-medium">Renews</th>
                                <th className="px-5 py-3 font-medium">Created</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {loading && rows.length === 0 ? (
                                <tr>
                                    <td
                                        className="px-5 py-4 text-label-sm text-sub-600"
                                        colSpan={9}
                                    >
                                        Loading companies…
                                    </td>
                                </tr>
                            ) : null}
                            {rows.map((org) => (
                                <tr key={org.id} className="text-label-sm">
                                    <td className="px-5 py-4">
                                        <Link
                                            href={`/admin/companies/${org.id}`}
                                            className="text-strong-950 hover:text-blue-500"
                                        >
                                            {org.name}
                                        </Link>
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {org.slug}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {org.planName}
                                        {org.autoRenew ? (
                                            <span className="mt-1 block text-label-xs text-sub-600">
                                                Auto-renew
                                            </span>
                                        ) : null}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {org.members}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {numberFormatter.format(org.storageUsed)}
                                        {org.storageLimit > 0
                                            ? ` / ${numberFormatter.format(org.storageLimit)} GB`
                                            : " GB"}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {org.tokenLimit > 0
                                            ? `${numberFormatter.format(org.tokensUsed)} / ${numberFormatter.format(org.tokenLimit)}`
                                            : numberFormatter.format(org.tokensUsed)}
                                        {org.tokenLimit > 0 ? (
                                            <span className="mt-1 block text-label-xs">
                                                rem{" "}
                                                {numberFormatter.format(
                                                    Math.max(
                                                        0,
                                                        org.tokenLimit -
                                                            org.tokensUsed
                                                    )
                                                )}
                                            </span>
                                        ) : null}
                                    </td>
                                    <td className="px-5 py-4">
                                        <StatusBadge status={org.status} />
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {org.renews}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {org.created}
                                    </td>
                                </tr>
                            ))}
                            {!loading && rows.length === 0 ? (
                                <tr>
                                    <td
                                        className="px-5 py-4 text-label-sm text-sub-600"
                                        colSpan={9}
                                    >
                                        No companies yet.
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};

export default LiveCompaniesPage;
