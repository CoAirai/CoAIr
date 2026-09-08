"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import PageHeader from "@/components/Admin/PageHeader";
import { AdminCompaniesTableSkeleton } from "@/components/Skeleton/sections";
import StatusBadge from "@/components/Admin/StatusBadge";
import {
    bytesToGb,
    companyStorageLimitBytes,
    companyStorageUsedBytes,
    planLabel,
} from "@/lib/admin/liveHelpers";
import { getPlanById, PLAN_ORDER, PLANS } from "@/lib/admin/plans";
import type { CompanyStatus, Plan, PlanId } from "@/lib/admin/types";
import { createAdminOrg } from "@/lib/coair/admin";
import { apiErrorMessage, listPackages } from "@/lib/coair/commerce";
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
    const [planId, setPlanId] = useState<PlanId>("demo");
    const [catalog, setCatalog] = useState<Plan[]>(PLANS);
    const [createError, setCreateError] = useState<string | null>(null);
    const [createSuccess, setCreateSuccess] = useState<string | null>(null);

    useEffect(() => {
        if (!token) return;
        void listPackages(token)
            .then((plans) => {
                if (plans.length) setCatalog(plans);
            })
            .catch(() => {
                /* keep static PLANS fallback */
            });
    }, [token]);

    const selectable = useMemo(() => {
        const byId = new Map(catalog.map((plan) => [plan.id, plan]));
        return PLAN_ORDER.map((id) => byId.get(id)).filter(
            (plan): plan is Plan => Boolean(plan)
        );
    }, [catalog]);

    const selectedPlan = getPlanById(planId, selectable) ?? selectable[0];

    const rows: CompanyRow[] = orgs.map((org) => {
        const members = users.filter((user) => user.org_id === org.org_id);
        const tokensUsed = members.reduce(
            (sum, user) => sum + (user.used_tokens ?? 0),
            0
        );
        const tokensAllocated = members.reduce(
            (sum, user) => sum + (user.token_limit ?? 0),
            0
        );
        const orgPlanId = org.subscription?.plan_id || org.default_plan_type;
        const plan = getPlanById(orgPlanId || "", catalog);
        const tokenLimit =
            org.default_token_limit ||
            tokensAllocated ||
            plan?.queryCap ||
            0;
        const storageLimit = companyStorageLimitBytes({
            defaultStorageBytes: org.default_storage_bytes,
            planStorageGb: plan?.storageLimitGb,
            memberLimits: members.map((user) => user.storage_limit_bytes),
        });
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
            planName: planLabel(orgPlanId),
            storageUsed: bytesToGb(companyStorageUsedBytes(members)),
            storageLimit: bytesToGb(storageLimit),
            tokensUsed,
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
        <div className="flex flex-col gap-8">
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
                            plan_id: planId,
                        });
                        setName("");
                        setOwner("");
                        setCreateError(null);
                        setCreateSuccess(
                            `Company created on ${selectedPlan?.name ?? planId}. Invite sent to ${owner.trim()}.`
                        );
                        await refresh();
                    } catch (err) {
                        setCreateSuccess(null);
                        setCreateError(apiErrorMessage(err));
                    }
                }}
                className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5"
            >
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,1fr)_minmax(180px,220px)_auto]">
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
                        value={planId}
                        onChange={(event) =>
                            setPlanId(event.target.value as PlanId)
                        }
                        className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                    >
                        {selectable.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                                {plan.name}
                                {plan.priceLabel ? ` · ${plan.priceLabel}` : ""}
                            </option>
                        ))}
                    </select>
                    <button
                        type="submit"
                        className="h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0"
                    >
                        Create company
                    </button>
                </div>
                {selectedPlan ? (
                    <p className="mt-3 text-label-sm text-sub-600">
                        {selectedPlan.name}: {selectedPlan.usersIncluded} users ·{" "}
                        {selectedPlan.storageLimitGb} GB ·{" "}
                        {numberFormatter.format(selectedPlan.queryCap)} CA · $
                        {selectedPlan.apiCreditsUsd} credits
                        {selectedPlan.id === "demo"
                            ? " · 30-day trial, then upgrade"
                            : ""}
                    </p>
                ) : null}
            </form>

            <AdminCompaniesTableSkeleton loading={loading && rows.length === 0}>
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
            </AdminCompaniesTableSkeleton>
        </div>
    );
};

export default LiveCompaniesPage;
