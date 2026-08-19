"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

import StatusBadge from "@/components/Admin/StatusBadge";
import ConfirmModal from "@/components/Admin/ConfirmModal";
import { useAdminData } from "@/context/AdminDataContext";
import { getPlanById } from "@/lib/admin/plans";
import {
    filterCompanies,
    getStorageRemaining,
    getTokensRemaining,
} from "@/lib/admin/selectors";
import type { CompanyStatus, PlanId } from "@/lib/admin/types";
import { isValidInviteEmail } from "@/lib/admin/wave2Helpers";

const numberFormatter = new Intl.NumberFormat("en-US");
const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
});

const CompaniesPage = () => {
    const {
        companies,
        createCompany,
        setCompanyStatus,
        plans,
    } = useAdminData();
    const [search, setSearch] = useState("");
    const [planId, setPlanId] = useState<PlanId | "all">("all");
    const [status, setStatus] = useState<CompanyStatus | "all">("all");
    const [showCreate, setShowCreate] = useState(false);
    const [name, setName] = useState("");
    const [industry, setIndustry] = useState("");
    const [newPlanId, setNewPlanId] = useState<PlanId>("foundation");
    const [newStatus, setNewStatus] = useState<CompanyStatus>("trial");
    const [ownerEmail, setOwnerEmail] = useState("");
    const [ownerName, setOwnerName] = useState("");
    const [createError, setCreateError] = useState<string | null>(null);
    const [createSuccess, setCreateSuccess] = useState<string | null>(null);
    const [suspendTarget, setSuspendTarget] = useState<{
        id: string;
        name: string;
    } | null>(null);

    const canCreate =
        name.trim().length > 0 && isValidInviteEmail(ownerEmail);

    const filtered = useMemo(
        () => filterCompanies(companies, { search, planId, status }),
        [companies, planId, search, status]
    );

    const onCreate = (event: FormEvent) => {
        event.preventDefault();
        if (!name.trim()) return;
        if (!isValidInviteEmail(ownerEmail)) {
            setCreateError("Owner invite email required");
            setCreateSuccess(null);
            return;
        }

        const result = createCompany({
            name,
            industry,
            planId: newPlanId,
            status: newStatus,
            ownerEmail,
            ownerName: ownerName.trim() || undefined,
        });
        if (!result.ok) {
            setCreateError(result.error ?? "Unable to create company");
            setCreateSuccess(null);
            return;
        }

        setCreateError(null);
        setCreateSuccess(
            `Company invited — setup email sent to ${ownerEmail.trim()}`
        );
        setName("");
        setIndustry("");
        setNewPlanId("foundation");
        setNewStatus("trial");
        setOwnerEmail("");
        setOwnerName("");
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-label-xl text-strong-950">Companies</h1>
                    <p className="mt-1 text-label-sm text-sub-600">
                        Invite companies and assign packages. Access requests
                        live under Onboarding. Company admins invite their own
                        users.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setShowCreate((v) => !v);
                        setCreateError(null);
                        setCreateSuccess(null);
                    }}
                    className="h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0 transition-opacity hover:opacity-90"
                >
                    {showCreate ? "Cancel" : "Invite company"}
                </button>
            </div>

            {showCreate && (
                <form
                    onSubmit={onCreate}
                    className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5"
                >
                    <h2 className="text-label-lg text-strong-950">
                        Invite company
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        The owner email receives a mock setup invite. That
                        company admin invites their teammates later.
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <label className="block">
                            <span className="mb-1.5 block text-label-xs text-sub-600">
                                Company name
                            </span>
                            <input
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                                placeholder="Acme Corp"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1.5 block text-label-xs text-sub-600">
                                Industry
                            </span>
                            <input
                                value={industry}
                                onChange={(e) => setIndustry(e.target.value)}
                                className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                                placeholder="Construction"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1.5 block text-label-xs text-sub-600">
                                Package / plan
                            </span>
                            <select
                                value={newPlanId}
                                onChange={(e) =>
                                    setNewPlanId(e.target.value as PlanId)
                                }
                                className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                            >
                                {plans.map((plan) => (
                                    <option key={plan.id} value={plan.id}>
                                        {plan.name} — {plan.storageLimitGb} GB /{" "}
                                        {numberFormatter.format(plan.queryCap)}{" "}
                                        queries
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block">
                            <span className="mb-1.5 block text-label-xs text-sub-600">
                                Status
                            </span>
                            <select
                                value={newStatus}
                                onChange={(e) =>
                                    setNewStatus(
                                        e.target.value as CompanyStatus
                                    )
                                }
                                className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                            >
                                <option value="trial">Trial</option>
                                <option value="active">Active</option>
                                <option value="suspended">Suspended</option>
                            </select>
                        </label>
                        <label className="block">
                            <span className="mb-1.5 block text-label-xs text-sub-600">
                                Owner invite email
                            </span>
                            <input
                                required
                                type="email"
                                value={ownerEmail}
                                onChange={(e) => setOwnerEmail(e.target.value)}
                                className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                                placeholder="owner@company.com"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1.5 block text-label-xs text-sub-600">
                                Owner name (optional)
                            </span>
                            <input
                                value={ownerName}
                                onChange={(e) => setOwnerName(e.target.value)}
                                className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                                placeholder="Jane Doe"
                            />
                        </label>
                    </div>
                    {createError && (
                        <p className="mt-3 text-label-xs text-red-500">
                            {createError}
                        </p>
                    )}
                    {createSuccess && (
                        <p className="mt-3 text-label-xs text-green-600">
                            {createSuccess}
                        </p>
                    )}
                    <button
                        type="submit"
                        disabled={!canCreate}
                        className="mt-4 h-10 rounded-full bg-blue-500 px-4 text-label-sm text-white-0 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Invite & assign package
                    </button>
                </form>
            )}

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="grid gap-3 border-b border-stroke-soft-200 p-5 md:grid-cols-[minmax(240px,1fr)_200px_200px]">
                    <label className="block">
                        <span className="sr-only">Search companies</span>
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by company name"
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-label-sm outline-none placeholder:text-sub-600 focus:border-blue-500"
                        />
                    </label>
                    <label className="block">
                        <span className="sr-only">Filter by plan</span>
                        <select
                            value={planId}
                            onChange={(e) =>
                                setPlanId(e.target.value as PlanId | "all")
                            }
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        >
                            <option value="all">All plans</option>
                            {plans.map((plan) => (
                                <option key={plan.id} value={plan.id}>
                                    {plan.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="sr-only">Filter by status</span>
                        <select
                            value={status}
                            onChange={(e) =>
                                setStatus(
                                    e.target.value as CompanyStatus | "all"
                                )
                            }
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        >
                            <option value="all">All statuses</option>
                            <option value="active">Active</option>
                            <option value="trial">Trial</option>
                            <option value="suspended">Suspended</option>
                        </select>
                    </label>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1280px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">Name</th>
                                <th className="px-5 py-3 font-medium">
                                    Industry
                                </th>
                                <th className="px-5 py-3 font-medium">Plan</th>
                                <th className="px-5 py-3 font-medium">Users</th>
                                <th className="px-5 py-3 font-medium">
                                    Storage
                                </th>
                                <th className="px-5 py-3 font-medium">Tokens</th>
                                <th className="px-5 py-3 font-medium">Status</th>
                                <th className="px-5 py-3 font-medium">
                                    Created
                                </th>
                                <th className="px-5 py-3 font-medium">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {filtered.map((company) => (
                                <tr key={company.id} className="text-label-sm">
                                    <td className="px-5 py-4">
                                        <Link
                                            href={`/admin/companies/${company.id}`}
                                            className="text-strong-950 hover:text-blue-500"
                                        >
                                            {company.name}
                                        </Link>
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {company.industry}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {getPlanById(company.planId, plans)?.name ??
                                            "Unknown"}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {numberFormatter.format(
                                            company.usersCount
                                        )}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {numberFormatter.format(
                                            company.storageUsedGb
                                        )}{" "}
                                        /{" "}
                                        {numberFormatter.format(
                                            company.storageLimitGb
                                        )}{" "}
                                        GB
                                        <span className="mt-1 block text-label-xs">
                                            rem{" "}
                                            {numberFormatter.format(
                                                getStorageRemaining(company)
                                            )}{" "}
                                            GB
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {numberFormatter.format(
                                            company.tokensUsed
                                        )}{" "}
                                        /{" "}
                                        {numberFormatter.format(
                                            company.tokenLimit
                                        )}
                                        <span className="mt-1 block text-label-xs">
                                            rem{" "}
                                            {numberFormatter.format(
                                                getTokensRemaining(company)
                                            )}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4">
                                        <StatusBadge status={company.status} />
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {dateFormatter.format(
                                            new Date(
                                                `${company.createdAt}T00:00:00`
                                            )
                                        )}
                                    </td>
                                    <td className="px-5 py-4">
                                        {company.status === "suspended" ? (
                                            <button
                                                type="button"
                                                className="text-label-sm text-blue-500 hover:text-blue-600"
                                                onClick={() =>
                                                    setCompanyStatus(
                                                        company.id,
                                                        "active"
                                                    )
                                                }
                                            >
                                                Activate
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="text-label-sm text-red-500 hover:text-red-600"
                                                onClick={() =>
                                                    setSuspendTarget({
                                                        id: company.id,
                                                        name: company.name,
                                                    })
                                                }
                                            >
                                                Suspend
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filtered.length === 0 && (
                    <div className="px-5 py-12 text-center">
                        <p className="text-label-sm text-strong-950">
                            No companies found
                        </p>
                    </div>
                )}

                <div className="border-t border-stroke-soft-200 px-5 py-3 text-label-xs text-sub-600">
                    Showing {filtered.length} of {companies.length} companies
                </div>
            </section>

            <ConfirmModal
                open={suspendTarget !== null}
                onClose={() => setSuspendTarget(null)}
                title="Suspend company?"
                description={
                    suspendTarget
                        ? `${suspendTarget.name} will lose workspace access until activated again.`
                        : ""
                }
                confirmLabel="Suspend"
                tone="danger"
                onConfirm={() => {
                    if (!suspendTarget) return;
                    setCompanyStatus(suspendTarget.id, "suspended");
                }}
            />
        </div>
    );
};

export default CompaniesPage;
