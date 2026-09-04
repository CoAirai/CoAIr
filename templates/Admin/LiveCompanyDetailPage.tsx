"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import ConfirmModal from "@/components/Admin/ConfirmModal";
import OrgRoleSelect from "@/components/Admin/OrgRoleSelect";
import QuotaBar from "@/components/Admin/QuotaBar";
import RightsToggleCells from "@/components/Admin/RightsToggleCells";
import { AdminCompanyDetailSkeleton } from "@/components/Skeleton/sections";
import StatusBadge from "@/components/Admin/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import type { Invoice } from "@/lib/admin/billingTypes";
import { downloadInvoicePdf } from "@/lib/admin/invoiceDocument";
import InvoiceDetailModal from "@/components/Billing/InvoiceDetailModal";
import {
    RIGHT_COLUMNS,
    rightsFromFeatures,
    toggleRightInFeatures,
    type RightKey,
} from "@/lib/admin/rolesStub";
import { planLabel, bytesToGb, companyStorageLimitBytes } from "@/lib/admin/liveHelpers";
import { getPlanById } from "@/lib/admin/plans";
import type { SupportTicket } from "@/lib/admin/wave2Types";
import {
    addAdminOrgMember,
    adjustAdminCredits,
    assignAdminOrgPlan,
    createAdminUser,
    deleteAdminUser,
    forceLogoutAdminUser,
    listAdminUsers,
    patchAdminOrg,
    patchAdminUser,
    readAdminOrg,
    readAdminUserLedger,
    removeAdminOrgMember,
    setAdminUserActive,
    type CoairAdminOrgDetail,
    type CoairAdminUser,
    type CoairLedgerEntry,
} from "@/lib/coair/admin";
import { CoairApiError } from "@/lib/coair/client";
import { startLiveImpersonation } from "@/lib/coair/impersonate";
import { portalPush } from "@/lib/auth/portalNav";
import { listAdminTickets, listPackages } from "@/lib/coair/commerce";
import { listAdminInvoices, getAdminInvoice } from "@/lib/coair/ops";
import { useLiveAdmin } from "@/lib/coair/useLiveAdmin";
import type { Plan, PlanId } from "@/lib/admin/types";

type Props = {
    id: string;
};

type TabId = "overview" | "users" | "tokens" | "projects" | "billing";

const TABS: { id: TabId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "users", label: "Users" },
    { id: "tokens", label: "Tokens" },
    { id: "projects", label: "Projects" },
    { id: "billing", label: "Billing" },
];

const numberFormatter = new Intl.NumberFormat("en-US");
const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
});

const formatWhen = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return dateTimeFormatter.format(date);
};

const LiveCompanyDetailPage = ({ id }: Props) => {
    const { session, applySession } = useAuth();
    const token = session?.accessToken ?? "";
    const { refresh: refreshAdmin } = useLiveAdmin();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [org, setOrg] = useState<CoairAdminOrgDetail | null>(null);
    const [users, setUsers] = useState<CoairAdminUser[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [missing, setMissing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [suspendConfirmOpen, setSuspendConfirmOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [creditUser, setCreditUser] = useState("");
    const [creditAmount, setCreditAmount] = useState("100");
    const [creditReason, setCreditReason] = useState("Manual credit");
    const [ledgerUser, setLedgerUser] = useState("");
    const [ledger, setLedger] = useState<CoairLedgerEntry[]>([]);
    const [newUsername, setNewUsername] = useState("");
    const [memberUsername, setMemberUsername] = useState("");
    const [catalogPlans, setCatalogPlans] = useState<Plan[]>([]);
    const [assignPlanId, setAssignPlanId] = useState<PlanId>("custom");
    const [assignBusy, setAssignBusy] = useState(false);
    const [assignMessage, setAssignMessage] = useState<string | null>(null);

    const requestedTab = searchParams.get("tab");
    const activeTab: TabId = TABS.some((tab) => tab.id === requestedTab)
        ? (requestedTab as TabId)
        : "overview";

    const goToTab = (tab: TabId) => {
        const params = new URLSearchParams(searchParams.toString());
        if (tab === "overview") {
            params.delete("tab");
        } else {
            params.set("tab", tab);
        }
        const query = params.toString();
        router.push(`${pathname}${query ? `?${query}` : ""}`, {
            scroll: false,
        });
    };

    const load = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        setError(null);
        setMissing(false);
        try {
            const [detail, orgUsersPayload, invoiceRows, ticketRows] =
                await Promise.all([
                    readAdminOrg(token, id),
                    listAdminUsers(token, id).catch(() => ({
                        users: [] as CoairAdminUser[],
                    })),
                    listAdminInvoices(token).catch(() => [] as Invoice[]),
                    listAdminTickets(token).catch(() => [] as SupportTicket[]),
                ]);
            setOrg(detail);
            setUsers(orgUsersPayload.users ?? []);
            setInvoices(
                invoiceRows.filter((invoice) => invoice.companyId === id)
            );
            setTickets(
                ticketRows.filter((ticket) => ticket.companyId === id)
            );
        } catch (err) {
            if (err instanceof CoairApiError && err.status === 404) {
                setMissing(true);
                setOrg(null);
            } else {
                setError(
                    err instanceof Error ? err.message : "Unable to load company"
                );
            }
        } finally {
            setLoading(false);
        }
    }, [id, token]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (!token) return;
        void listPackages(token)
            .then((rows) => {
                setCatalogPlans(rows);
                if (!rows.some((plan) => plan.id === assignPlanId) && rows[0]) {
                    setAssignPlanId(rows[0].id);
                }
            })
            .catch(() => setCatalogPlans([]));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- seed assign once from catalog
    }, [token]);

    const onAssignPlan = async () => {
        if (!token || !org) return;
        setAssignBusy(true);
        setAssignMessage(null);
        setActionError(null);
        try {
            const result = await assignAdminOrgPlan(token, org.org_id, {
                plan_id: assignPlanId,
                record_invoice: true,
            });
            setAssignMessage(
                `Assigned ${result.plan?.name ?? assignPlanId} to ${org.name}`
            );
            await load();
            await refreshAdmin();
        } catch (err) {
            setActionError(
                err instanceof Error ? err.message : "Unable to assign plan"
            );
        } finally {
            setAssignBusy(false);
        }
    };

    const orgUsers = useMemo(() => {
        const byName = new Map(
            users.map((user) => [
                user.username,
                {
                    ...user,
                    role: user.org_role || user.role,
                },
            ])
        );
        for (const member of org?.members ?? []) {
            const existing = byName.get(member.username);
            if (existing) {
                byName.set(member.username, {
                    ...existing,
                    role: member.role || existing.org_role || existing.role,
                });
            }
        }
        return Array.from(byName.values());
    }, [org, users]);

    const tokenTotals = useMemo(
        () =>
            orgUsers.reduce(
                (acc, user) => {
                    acc.used += user.used_tokens ?? 0;
                    acc.limit += user.token_limit ?? 0;
                    acc.credits += user.credits_remaining ?? 0;
                    acc.storageUsed += user.storage_used_bytes ?? 0;
                    return acc;
                },
                { used: 0, limit: 0, credits: 0, storageUsed: 0 }
            ),
        [orgUsers]
    );

    const plan = getPlanById(
        org?.subscription?.plan_id || org?.default_plan_type || ""
    );
    const tokenLimit =
        org?.default_token_limit ||
        tokenTotals.limit ||
        plan?.queryCap ||
        0;
    const storageUsed = bytesToGb(tokenTotals.storageUsed);
    const storageLimit = bytesToGb(
        companyStorageLimitBytes({
            defaultStorageBytes: org?.default_storage_bytes,
            planStorageGb: plan?.storageLimitGb,
            memberLimits: orgUsers.map((user) => user.storage_limit_bytes),
        })
    );
    const suspended = Boolean(org?.archived_at);

    const setCompanyUserActive = async (
        username: string,
        isActive: boolean,
        orgRole: "owner" | "member" = "member"
    ) => {
        if (!token) return;
        setActionError(null);
        try {
            if (isActive) {
                await setAdminUserActive(token, username, true);
                await addAdminOrgMember(token, id, username, orgRole);
            } else {
                await setAdminUserActive(token, username, false);
                try {
                    await removeAdminOrgMember(token, id, username);
                } catch {
                    // User may already have been removed from the company.
                }
            }
            await Promise.all([load(), refreshAdmin()]);
        } catch (err) {
            setActionError(
                err instanceof Error ? err.message : "Update failed"
            );
        }
    };

    const removeCompanyUser = async (username: string) => {
        if (!token) return;
        setActionError(null);
        try {
            await deleteAdminUser(token, username);
            await Promise.all([load(), refreshAdmin()]);
        } catch (err) {
            setActionError(
                err instanceof Error ? err.message : "Remove failed"
            );
        }
    };

    const setArchived = async (archived: boolean) => {
        if (!token) return;
        setBusy(true);
        setActionError(null);
        try {
            await patchAdminOrg(token, id, { archived });
            await Promise.all([load(), refreshAdmin()]);
        } catch (err) {
            setActionError(
                err instanceof Error
                    ? err.message
                    : archived
                      ? "Unable to suspend company"
                      : "Unable to activate company"
            );
        } finally {
            setBusy(false);
        }
    };

    const onAdjustCredits = async (event: FormEvent) => {
        event.preventDefault();
        const amount = Number(creditAmount);
        const target = creditUser || orgUsers[0]?.username;
        if (!target || !Number.isFinite(amount) || amount === 0) {
            setActionError("Choose a user and a non-zero credit amount");
            return;
        }
        try {
            await adjustAdminCredits(token, target, {
                credits: amount,
                reason: creditReason.trim() || "Manual credit",
            });
            setActionError(null);
            await Promise.all([load(), refreshAdmin()]);
        } catch (err) {
            setActionError(
                err instanceof Error ? err.message : "Unable to adjust credits"
            );
        }
    };

    const onLoadLedger = async (username: string) => {
        setLedgerUser(username);
        try {
            const payload = await readAdminUserLedger(token, username);
            setLedger(payload.entries ?? []);
        } catch (err) {
            setActionError(
                err instanceof Error ? err.message : "Unable to load ledger"
            );
        }
    };

    if (loading && !org) {
        return (
            <AdminCompanyDetailSkeleton loading>
                <div />
            </AdminCompanyDetailSkeleton>
        );
    }

    if (missing || !org) {
        return (
            <div className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-8 text-center">
                <h1 className="text-label-xl text-strong-950">
                    Company not found
                </h1>
                <p className="mt-2 text-label-sm text-sub-600">
                    {error ??
                        "This organization is not in the live API."}
                </p>
                <Link
                    href="/admin/companies"
                    className="mt-5 inline-flex text-label-sm text-blue-500 hover:text-blue-600"
                >
                    Back to companies
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <Link
                        href="/admin/companies"
                        className="text-label-sm text-blue-500 hover:text-blue-600"
                    >
                        ← Back to companies
                    </Link>
                    <h1 className="mt-2 text-label-xl text-strong-950">
                        {org.name}
                    </h1>
                    <p className="mt-1 text-label-sm text-sub-600">
                        {org.slug ?? org.org_id} · Created {formatWhen(org.created_at)}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <StatusBadge
                        status={suspended ? "suspended" : "active"}
                    />
                    {suspended ? (
                        <button
                            type="button"
                            disabled={busy}
                            className="h-10 rounded-full bg-blue-500 px-4 text-label-sm text-white-0 disabled:opacity-60"
                            onClick={() => void setArchived(false)}
                        >
                            Activate
                        </button>
                    ) : (
                        <button
                            type="button"
                            disabled={busy}
                            className="h-10 rounded-full border border-red-200 px-4 text-label-sm text-red-500 disabled:opacity-60"
                            onClick={() => setSuspendConfirmOpen(true)}
                        >
                            Suspend
                        </button>
                    )}
                </div>
            </div>
            {error ? (
                <p className="text-label-sm text-red-500">{error}</p>
            ) : null}
            {actionError ? (
                <p className="text-label-sm text-red-500">{actionError}</p>
            ) : null}

            <div className="flex flex-wrap gap-2 rounded-full border border-stroke-soft-200 bg-white-0 p-1.5">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => goToTab(tab.id)}
                        className={`h-9 rounded-full px-4 text-label-sm transition-colors ${
                            activeTab === tab.id
                                ? "bg-strong-950 text-white-0"
                                : "text-sub-600 hover:text-strong-950"
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === "overview" ? (
                <div className="space-y-6">
                    <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                        <h2 className="text-label-lg text-strong-950">
                            Company details
                        </h2>
                        <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <div>
                                <dt className="text-label-xs text-sub-600">
                                    Company ID
                                </dt>
                                <dd className="mt-1 break-all text-label-sm text-strong-950">
                                    {org.org_id}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-label-xs text-sub-600">Plan</dt>
                                <dd className="mt-1 text-label-sm text-strong-950">
                                    {planLabel(
                                        org.subscription?.plan_id ||
                                            org.default_plan_type
                                    )}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-label-xs text-sub-600">
                                    Subscription
                                </dt>
                                <dd className="mt-1 text-label-sm text-strong-950">
                                    {org.subscription?.status || "—"}
                                    {org.subscription?.auto_renew
                                        ? " · auto-renew"
                                        : ""}
                                    {org.subscription?.cancel_at_period_end
                                        ? " · cancels at period end"
                                        : ""}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-label-xs text-sub-600">
                                    Period ends
                                </dt>
                                <dd className="mt-1 text-label-sm text-strong-950">
                                    {org.subscription?.current_period_end
                                        ? formatWhen(
                                              org.subscription.current_period_end
                                          )
                                        : "—"}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-label-xs text-sub-600">
                                    Members
                                </dt>
                                <dd className="mt-1 text-label-sm text-strong-950">
                                    {numberFormatter.format(
                                        org.counts?.members ?? orgUsers.length
                                    )}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-label-xs text-sub-600">
                                    Projects
                                </dt>
                                <dd className="mt-1 text-label-sm text-strong-950">
                                    {numberFormatter.format(
                                        org.counts?.projects ??
                                            org.projects?.length ??
                                            0
                                    )}
                                </dd>
                            </div>
                        </dl>
                    </section>
                    <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                        <h2 className="text-label-lg text-strong-950">
                            Assign package
                        </h2>
                        <p className="mt-1 text-label-xs text-sub-600">
                            Use this for Custom (or any package) when a company
                            asks for something outside self-serve onboarding.
                            Applies storage and token limits immediately and
                            records an invoice for the package price.
                        </p>
                        <div className="mt-4 flex flex-wrap items-end gap-3">
                            <label className="block min-w-[12rem] text-label-xs text-sub-600">
                                Package
                                <select
                                    className="mt-1 h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                                    value={assignPlanId}
                                    onChange={(event) =>
                                        setAssignPlanId(
                                            event.target.value as PlanId
                                        )
                                    }
                                >
                                    {catalogPlans.map((plan) => (
                                        <option key={plan.id} value={plan.id}>
                                            {plan.name}
                                            {plan.id === "custom"
                                                ? " (assign-only)"
                                                : ""}{" "}
                                            · ${plan.apiCreditsUsd}/mo
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <button
                                type="button"
                                disabled={assignBusy || catalogPlans.length === 0}
                                onClick={() => void onAssignPlan()}
                                className="h-10 rounded-xl bg-strong-950 px-4 text-label-sm text-white-0 hover:opacity-90 disabled:opacity-50"
                            >
                                {assignBusy ? "Assigning…" : "Assign package"}
                            </button>
                        </div>
                        {assignMessage ? (
                            <p className="mt-3 text-label-sm text-green-600">
                                {assignMessage}
                            </p>
                        ) : null}
                    </section>
                    <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                        <h2 className="text-label-lg text-strong-950">Quotas</h2>
                        <div className="mt-5 grid gap-5 lg:grid-cols-2">
                            <QuotaBar
                                label="Token pool"
                                used={
                                    org.token_pool?.total_used ??
                                    tokenTotals.used
                                }
                                limit={
                                    org.token_pool?.pool ||
                                    tokenLimit ||
                                    0
                                }
                            />
                            <QuotaBar
                                label="Storage"
                                used={storageUsed}
                                limit={storageLimit}
                                unit="GB"
                            />
                        </div>
                        <p className="mt-3 text-label-sm text-sub-600">
                            {org.token_pool
                                ? `Equal share ${numberFormatter.format(org.token_pool.equal_share)} · ${org.token_pool.member_count} members · `
                                : ""}
                            Default credits:{" "}
                            {numberFormatter.format(org.default_credits ?? 0)} ·
                            Remaining on accounts:{" "}
                            {numberFormatter.format(tokenTotals.credits)}
                        </p>
                    </section>
                </div>
            ) : null}

            {activeTab === "users" ? (
                <div className="space-y-6">
                    <form
                        onSubmit={async (event: FormEvent) => {
                            event.preventDefault();
                            try {
                                await createAdminUser(token, {
                                    username: newUsername.trim(),
                                    org_id: id,
                                });
                                setNewUsername("");
                                await Promise.all([load(), refreshAdmin()]);
                            } catch (err) {
                                setActionError(
                                    err instanceof Error
                                        ? err.message
                                        : "Unable to create user"
                                );
                            }
                        }}
                        className="grid gap-3 rounded-2xl border border-stroke-soft-200 bg-white-0 p-5 md:grid-cols-[minmax(0,1fr)_auto]"
                    >
                        <input
                            required
                            type="email"
                            value={newUsername}
                            onChange={(event) => setNewUsername(event.target.value)}
                            placeholder="Invite work email"
                            className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        />
                        <button
                            type="submit"
                            className="h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0"
                        >
                            Invite user
                        </button>
                    </form>
                    <form
                        onSubmit={async (event: FormEvent) => {
                            event.preventDefault();
                            try {
                                await addAdminOrgMember(
                                    token,
                                    id,
                                    memberUsername.trim()
                                );
                                setMemberUsername("");
                                await load();
                            } catch (err) {
                                setActionError(
                                    err instanceof Error
                                        ? err.message
                                        : "Unable to add member"
                                );
                            }
                        }}
                        className="grid gap-3 rounded-2xl border border-stroke-soft-200 bg-white-0 p-5 md:grid-cols-[minmax(0,1fr)_auto]"
                    >
                        <input
                            required
                            value={memberUsername}
                            onChange={(event) =>
                                setMemberUsername(event.target.value)
                            }
                            placeholder="Existing username to add"
                            className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        />
                        <button
                            type="submit"
                            className="h-10 rounded-full border border-stroke-soft-200 px-4 text-label-sm text-strong-950"
                        >
                            Add member
                        </button>
                    </form>
                <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1280px] text-left">
                            <thead className="bg-weak-50 text-label-xs text-sub-600">
                                <tr>
                                    <th className="px-5 py-3 font-medium">User</th>
                                    <th className="px-5 py-3 font-medium">Role</th>
                                    {RIGHT_COLUMNS.map((column) => (
                                        <th
                                            key={column.key}
                                            className="px-5 py-3 text-center font-medium"
                                        >
                                            {column.label}
                                        </th>
                                    ))}
                                    <th className="px-5 py-3 font-medium">
                                        Tokens
                                    </th>
                                    <th className="px-5 py-3 font-medium">
                                        Status
                                    </th>
                                    <th className="px-5 py-3 font-medium">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stroke-soft-200">
                                {orgUsers.map((user) => (
                                    <tr
                                        key={user.username}
                                        className="text-label-sm"
                                    >
                                        <td className="px-5 py-4">
                                            <p className="text-strong-950">
                                                {user.display_name ||
                                                    user.username}
                                            </p>
                                            <p className="text-label-xs text-sub-600">
                                                {user.username}
                                            </p>
                                        </td>
                                        <td className="px-5 py-4 capitalize text-sub-600">
                                            {org?.org_id ? (
                                                <OrgRoleSelect
                                                    value={
                                                        user.org_role ||
                                                        user.role ||
                                                        "member"
                                                    }
                                                    disabled={
                                                        (user.org_role ||
                                                            user.role) ===
                                                            "owner" &&
                                                        orgUsers.filter(
                                                            (entry) =>
                                                                (entry.org_role ||
                                                                    entry.role) ===
                                                                "owner"
                                                        ).length <= 1
                                                    }
                                                    onChange={(role) =>
                                                        void addAdminOrgMember(
                                                            token,
                                                            org.org_id,
                                                            user.username,
                                                            role
                                                        )
                                                            .then(() => load())
                                                            .catch((err) =>
                                                                setActionError(
                                                                    err instanceof
                                                                        Error
                                                                        ? err.message
                                                                        : "Role update failed"
                                                                )
                                                            )
                                                    }
                                                />
                                            ) : (
                                                user.role || "member"
                                            )}
                                        </td>
                                        <RightsToggleCells
                                            rights={rightsFromFeatures(
                                                user.features,
                                                user.org_role ||
                                                    user.role ||
                                                    "member"
                                            )}
                                            onToggle={(
                                                key: RightKey,
                                                enabled
                                            ) =>
                                                void patchAdminUser(
                                                    token,
                                                    user.username,
                                                    {
                                                        features:
                                                            toggleRightInFeatures(
                                                                user.features,
                                                                user.org_role ||
                                                                    user.role ||
                                                                    "member",
                                                                key,
                                                                enabled
                                                            ),
                                                    }
                                                )
                                                    .then(() => load())
                                                    .catch((err) =>
                                                        setActionError(
                                                            err instanceof Error
                                                                ? err.message
                                                                : "Rights update failed"
                                                        )
                                                    )
                                            }
                                        />
                                        <td className="px-5 py-4 text-sub-600">
                                            {numberFormatter.format(
                                                user.used_tokens ?? 0
                                            )}
                                            {user.token_limit
                                                ? ` / ${numberFormatter.format(user.token_limit)}`
                                                : ""}
                                        </td>
                                        <td className="px-5 py-4">
                                            <StatusBadge
                                                status={
                                                    user.is_active === false
                                                        ? "suspended"
                                                        : "active"
                                                }
                                            />
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex flex-wrap gap-3">
                                                <button
                                                    type="button"
                                                    className="text-label-sm text-blue-500 hover:text-blue-600"
                                                    onClick={() =>
                                                        void setCompanyUserActive(
                                                            user.username,
                                                            user.is_active === false,
                                                            user.org_role === "owner"
                                                                ? "owner"
                                                                : "member"
                                                        )
                                                    }
                                                >
                                                    {user.is_active === false
                                                        ? "Activate"
                                                        : "Deactivate"}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="text-label-sm text-red-500 hover:text-red-600"
                                                    onClick={() =>
                                                        void removeCompanyUser(
                                                            user.username
                                                        )
                                                    }
                                                >
                                                    Remove
                                                </button>
                                                <button
                                                    type="button"
                                                    className="text-label-sm text-blue-500 hover:text-blue-600"
                                                    onClick={() =>
                                                        void startLiveImpersonation({
                                                            adminSession: session!,
                                                            token,
                                                            username: user.username,
                                                            applySession,
                                                        })
                                                            .then(({ href }) =>
                                                                portalPush(router, href)
                                                            )
                                                            .catch((err) =>
                                                                setActionError(
                                                                    err instanceof Error
                                                                        ? err.message
                                                                        : "Impersonation failed"
                                                                )
                                                            )
                                                    }
                                                >
                                                    Impersonate
                                                </button>
                                                <button
                                                    type="button"
                                                    className="text-label-sm text-sub-600 hover:text-strong-950"
                                                    onClick={() =>
                                                        void forceLogoutAdminUser(
                                                            token,
                                                            user.username
                                                        )
                                                            .then(() => load())
                                                            .catch((err) =>
                                                                setActionError(
                                                                    err instanceof Error
                                                                        ? err.message
                                                                        : "Force logout failed"
                                                                )
                                                            )
                                                    }
                                                >
                                                    Force logout
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {orgUsers.length === 0 ? (
                        <div className="px-5 py-12 text-center">
                            <p className="text-label-sm text-strong-950">
                                No users found for this company
                            </p>
                        </div>
                    ) : null}
                </section>
                </div>
            ) : null}

            {activeTab === "tokens" ? (
                <div className="space-y-6">
                <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                    <h2 className="text-label-lg text-strong-950">
                        Company token pool
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Same shared pool company admins and members see in their
                        portal.
                    </p>
                    <div className="mt-4">
                        <QuotaBar
                            label="Tokens"
                            used={org.token_pool?.total_used ?? tokenTotals.used}
                            limit={org.token_pool?.pool || tokenLimit || 0}
                        />
                    </div>
                    <p className="mt-3 text-label-sm text-sub-600">
                        Remaining:{" "}
                        {numberFormatter.format(
                            org.token_pool?.remaining ??
                                Math.max(0, tokenLimit - tokenTotals.used)
                        )}
                        {org.token_pool
                            ? ` · Equal share ${numberFormatter.format(org.token_pool.equal_share)} across ${org.token_pool.member_count} members`
                            : tokenLimit === 0
                              ? " · No token pool reported yet."
                              : ""}
                    </p>
                    {org.token_pool?.members?.length ? (
                        <div className="mt-5 overflow-x-auto">
                            <table className="w-full min-w-[640px] text-left">
                                <thead className="bg-weak-50 text-label-xs text-sub-600">
                                    <tr>
                                        <th className="px-4 py-2 font-medium">
                                            Member
                                        </th>
                                        <th className="px-4 py-2 font-medium">
                                            Used
                                        </th>
                                        <th className="px-4 py-2 font-medium">
                                            Limit
                                        </th>
                                        <th className="px-4 py-2 font-medium">
                                            Remaining
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-stroke-soft-200">
                                    {org.token_pool.members.map((member) => (
                                        <tr
                                            key={member.username}
                                            className="text-label-sm"
                                        >
                                            <td className="px-4 py-3 text-strong-950">
                                                {member.display_name ||
                                                    member.username}
                                            </td>
                                            <td className="px-4 py-3 text-sub-600">
                                                {numberFormatter.format(
                                                    member.used_tokens
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-sub-600">
                                                {numberFormatter.format(
                                                    member.token_limit
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-sub-600">
                                                {numberFormatter.format(
                                                    member.remaining
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : null}
                </section>
                <form
                    onSubmit={(event) => void onAdjustCredits(event)}
                    className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5"
                >
                    <h2 className="text-label-lg text-strong-950">
                        Credit adjustment
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Adjusts API credits for a member. Token pool shares are
                        managed by company admins via transfers and purchases.
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <select
                            value={creditUser}
                            onChange={(event) => setCreditUser(event.target.value)}
                            className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        >
                            <option value="">First member</option>
                            {orgUsers.map((user) => (
                                <option key={user.username} value={user.username}>
                                    {user.display_name || user.username}
                                </option>
                            ))}
                        </select>
                        <input
                            type="number"
                            value={creditAmount}
                            onChange={(event) => setCreditAmount(event.target.value)}
                            className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        />
                        <input
                            required
                            minLength={3}
                            value={creditReason}
                            onChange={(event) => setCreditReason(event.target.value)}
                            placeholder="Reason"
                            className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        />
                    </div>
                    <button
                        type="submit"
                        className="mt-4 h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0"
                    >
                        Apply credits
                    </button>
                </form>
                <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-label-lg text-strong-950">Ledger</h2>
                        <select
                            value={ledgerUser}
                            onChange={(event) =>
                                void onLoadLedger(event.target.value)
                            }
                            className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        >
                            <option value="">Choose user</option>
                            {orgUsers.map((user) => (
                                <option key={user.username} value={user.username}>
                                    {user.display_name || user.username}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="mt-4 divide-y divide-stroke-soft-200">
                        {ledger.map((entry) => (
                            <div key={entry.event_id} className="py-3">
                                <p className="text-label-sm text-strong-950">
                                    {entry.event_type} · {entry.model || "credits"}
                                </p>
                                <p className="text-label-xs text-sub-600">
                                    {formatWhen(entry.created_at)}
                                    {entry.note ? ` · ${entry.note}` : ""}
                                </p>
                            </div>
                        ))}
                        {ledgerUser && ledger.length === 0 ? (
                            <p className="py-4 text-label-sm text-sub-600">
                                No ledger entries for this user.
                            </p>
                        ) : null}
                    </div>
                </section>
                </div>
            ) : null}

            {activeTab === "projects" ? (
                <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-left">
                            <thead className="bg-weak-50 text-label-xs text-sub-600">
                                <tr>
                                    <th className="px-5 py-3 font-medium">
                                        Project
                                    </th>
                                    <th className="px-5 py-3 font-medium">
                                        Members
                                    </th>
                                    <th className="px-5 py-3 font-medium">
                                        Updated
                                    </th>
                                    <th className="px-5 py-3 font-medium">
                                        Status
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stroke-soft-200">
                                {(org.projects ?? []).map((project) => (
                                    <tr
                                        key={project.project_id}
                                        className="text-label-sm"
                                    >
                                        <td className="px-5 py-4 text-strong-950">
                                            {project.name}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {project.member_count ?? "—"}
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {formatWhen(
                                                project.updated_at ||
                                                    project.created_at
                                            )}
                                        </td>
                                        <td className="px-5 py-4">
                                            <StatusBadge
                                                status={
                                                    project.archived_at
                                                        ? "suspended"
                                                        : "active"
                                                }
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {(org.projects ?? []).length === 0 ? (
                        <div className="px-5 py-12 text-center">
                            <p className="text-label-sm text-strong-950">
                                No projects in this company
                            </p>
                        </div>
                    ) : null}
                </section>
            ) : null}

            {activeTab === "billing" ? (
                <div className="space-y-6">
                    <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                        <div className="border-b border-stroke-soft-200 px-5 py-4">
                            <h2 className="text-label-lg text-strong-950">
                                Invoices
                            </h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[560px] text-left">
                                <thead className="bg-weak-50 text-label-xs text-sub-600">
                                    <tr>
                                        <th className="px-5 py-3 font-medium">
                                            Invoice
                                        </th>
                                        <th className="px-5 py-3 font-medium">
                                            Amount
                                        </th>
                                        <th className="px-5 py-3 font-medium">
                                            Issued
                                        </th>
                                        <th className="px-5 py-3 font-medium">
                                            Status
                                        </th>
                                        <th className="px-5 py-3 font-medium">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-stroke-soft-200">
                                    {invoices.map((invoice) => (
                                        <tr
                                            key={invoice.id}
                                            className="text-label-sm"
                                        >
                                            <td className="px-5 py-4 text-strong-950">
                                                {invoice.id}
                                            </td>
                                            <td className="px-5 py-4 text-sub-600">
                                                $
                                                {numberFormatter.format(
                                                    invoice.amountUsd
                                                )}
                                            </td>
                                            <td className="px-5 py-4 text-sub-600">
                                                {dateFormatter.format(
                                                    new Date(
                                                        invoice.issuedAt.length <=
                                                        10
                                                            ? `${invoice.issuedAt}T00:00:00`
                                                            : invoice.issuedAt
                                                    )
                                                )}
                                            </td>
                                            <td className="px-5 py-4">
                                                <StatusBadge
                                                    status={invoice.status}
                                                />
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setViewInvoice(
                                                                invoice
                                                            );
                                                            if (!token) return;
                                                            void getAdminInvoice(
                                                                token,
                                                                invoice.id
                                                            )
                                                                .then(
                                                                    setViewInvoice
                                                                )
                                                                .catch(
                                                                    () =>
                                                                        undefined
                                                                );
                                                        }}
                                                        className="h-8 rounded-lg border border-stroke-soft-200 px-3 text-label-xs text-strong-950 hover:bg-weak-50"
                                                    >
                                                        View
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            downloadInvoicePdf(
                                                                invoice,
                                                                org?.name
                                                            )
                                                        }
                                                        className="h-8 rounded-lg bg-blue-500 px-3 text-label-xs text-white-0 hover:bg-blue-600"
                                                    >
                                                        Download
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {invoices.length === 0 ? (
                            <p className="px-5 py-8 text-label-sm text-sub-600">
                                No invoices for this company.
                            </p>
                        ) : null}
                    </section>
                    <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                        <div className="border-b border-stroke-soft-200 px-5 py-4">
                            <h2 className="text-label-lg text-strong-950">
                                Tickets
                            </h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[560px] text-left">
                                <thead className="bg-weak-50 text-label-xs text-sub-600">
                                    <tr>
                                        <th className="px-5 py-3 font-medium">
                                            Subject
                                        </th>
                                        <th className="px-5 py-3 font-medium">
                                            Priority
                                        </th>
                                        <th className="px-5 py-3 font-medium">
                                            Created
                                        </th>
                                        <th className="px-5 py-3 font-medium">
                                            Status
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-stroke-soft-200">
                                    {tickets.map((ticket) => (
                                        <tr
                                            key={ticket.id}
                                            className="text-label-sm"
                                        >
                                            <td className="px-5 py-4 text-strong-950">
                                                {ticket.subject}
                                            </td>
                                            <td className="px-5 py-4 capitalize text-sub-600">
                                                {ticket.priority}
                                            </td>
                                            <td className="px-5 py-4 text-sub-600">
                                                {formatWhen(ticket.createdAt)}
                                            </td>
                                            <td className="px-5 py-4">
                                                <StatusBadge
                                                    status={ticket.status}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {tickets.length === 0 ? (
                            <p className="px-5 py-8 text-label-sm text-sub-600">
                                No tickets for this company.
                            </p>
                        ) : null}
                    </section>
                </div>
            ) : null}

            <ConfirmModal
                open={suspendConfirmOpen}
                onClose={() => setSuspendConfirmOpen(false)}
                title="Suspend this company?"
                description="The company will be archived and hidden from the default tenant list until you activate it again."
                confirmLabel="Suspend"
                tone="danger"
                onConfirm={() => void setArchived(true)}
            />
            <InvoiceDetailModal
                invoice={viewInvoice}
                companyName={org?.name}
                onClose={() => setViewInvoice(null)}
            />
        </div>
    );
};

export default LiveCompanyDetailPage;
