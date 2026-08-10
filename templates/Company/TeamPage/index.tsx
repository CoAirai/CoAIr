"use client";

import { FormEvent, useMemo, useState } from "react";

import PageHeader from "@/components/Admin/PageHeader";
import StatusBadge from "@/components/Admin/StatusBadge";
import { useCompanyData } from "@/context/CompanyDataContext";
import { isValidInviteEmail } from "@/lib/admin/wave2Helpers";
import type { UserRole, UserStatus } from "@/lib/admin/types";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
});

const ROLE_OPTIONS: UserRole[] = ["admin", "member", "viewer"];

const TeamPage = () => {
    const { users, inviteUser, resendInvite, setUserRole, setUserStatus } =
        useCompanyData();
    const [showInvite, setShowInvite] = useState(false);
    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [role, setRole] = useState<UserRole>("member");
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<UserStatus | "all">("all");

    const canInvite = isValidInviteEmail(email);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return users.filter((user) => {
            if (
                q &&
                !user.name.toLowerCase().includes(q) &&
                !user.email.toLowerCase().includes(q)
            ) {
                return false;
            }
            if (statusFilter !== "all" && user.status !== statusFilter) {
                return false;
            }
            return true;
        });
    }, [search, statusFilter, users]);

    const onInvite = (event: FormEvent) => {
        event.preventDefault();
        if (!isValidInviteEmail(email)) {
            setInviteError("Enter a valid email address");
            setInviteSuccess(null);
            return;
        }

        const result = inviteUser({
            email: email.trim(),
            name: name.trim() || undefined,
            role,
        });
        if (!result.ok) {
            setInviteError(result.error ?? "Unable to send invite");
            setInviteSuccess(null);
            return;
        }

        setInviteError(null);
        setInviteSuccess(`Invite sent to ${email.trim()}`);
        setEmail("");
        setName("");
        setRole("member");
    };

    const onResend = (userId: string) => {
        const result = resendInvite(userId);
        if (!result.ok) {
            setActionMessage(result.error ?? "Unable to resend invite");
            return;
        }
        const target = users.find((u) => u.id === userId);
        setActionMessage(
            target ? `Invite resent to ${target.email}` : "Invite resent"
        );
    };

    return (
        <div className="page-stack">
            <PageHeader
                title="Team"
                description="Invite teammates, manage roles, and suspend access."
                action={
                    <button
                        type="button"
                        onClick={() => {
                            setShowInvite((v) => !v);
                            setInviteError(null);
                            setInviteSuccess(null);
                        }}
                        className="h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0 hover:opacity-90"
                    >
                        {showInvite ? "Close invite" : "Invite teammate"}
                    </button>
                }
            />

            {showInvite && (
                <form
                    onSubmit={onInvite}
                    className="surface-panel p-5"
                >
                    <h2 className="text-label-lg text-strong-950">
                        Invite user
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        New members receive a mock invite email and start as
                        pending. Token shares rebalance equally across the team.
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <label className="block">
                            <span className="mb-1.5 block text-label-xs text-sub-600">
                                Email
                            </span>
                            <input
                                required
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@company.com"
                                className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none placeholder:text-sub-600 focus:border-blue-500"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1.5 block text-label-xs text-sub-600">
                                Name (optional)
                            </span>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Full name"
                                className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none placeholder:text-sub-600 focus:border-blue-500"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1.5 block text-label-xs text-sub-600">
                                Role
                            </span>
                            <select
                                value={role}
                                onChange={(e) =>
                                    setRole(e.target.value as UserRole)
                                }
                                className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                            >
                                {ROLE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                        {option.charAt(0).toUpperCase() +
                                            option.slice(1)}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    {inviteError && (
                        <p className="mt-3 text-label-sm text-red-500">
                            {inviteError}
                        </p>
                    )}
                    {inviteSuccess && (
                        <p className="mt-3 text-label-sm text-green-600">
                            {inviteSuccess}
                        </p>
                    )}
                    <button
                        type="submit"
                        disabled={!canInvite}
                        className="mt-4 h-10 rounded-full bg-blue-500 px-4 text-label-sm text-white-0 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Send invite
                    </button>
                </form>
            )}

            {actionMessage && (
                <p className="text-label-sm text-sub-600">{actionMessage}</p>
            )}

            <section className="surface-panel">
                <div className="grid gap-3 border-b border-stroke-soft-200 p-5 md:grid-cols-[minmax(240px,1fr)_200px]">
                    <label className="block">
                        <span className="sr-only">Search team</span>
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by name or email"
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none placeholder:text-sub-600 focus:border-blue-500"
                        />
                    </label>
                    <label className="block">
                        <span className="sr-only">Filter by status</span>
                        <select
                            value={statusFilter}
                            onChange={(e) =>
                                setStatusFilter(
                                    e.target.value as UserStatus | "all"
                                )
                            }
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        >
                            <option value="all">All statuses</option>
                            <option value="active">Active</option>
                            <option value="pending">Pending</option>
                            <option value="suspended">Suspended</option>
                        </select>
                    </label>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[960px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">Name</th>
                                <th className="px-5 py-3 font-medium">Email</th>
                                <th className="px-5 py-3 font-medium">Role</th>
                                <th className="px-5 py-3 font-medium">Status</th>
                                <th className="px-5 py-3 font-medium">
                                    Last login
                                </th>
                                <th className="px-5 py-3 font-medium">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {filtered.map((user) => (
                                <tr key={user.id} className="text-label-sm">
                                    <td className="px-5 py-4 text-strong-950">
                                        {user.name}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {user.email}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        <select
                                            value={user.role}
                                            onChange={(e) =>
                                                setUserRole(
                                                    user.id,
                                                    e.target.value as UserRole
                                                )
                                            }
                                            className="h-8 rounded-lg border border-stroke-soft-200 px-2 text-label-xs outline-none focus:border-blue-500"
                                        >
                                            {ROLE_OPTIONS.map((option) => (
                                                <option
                                                    key={option}
                                                    value={option}
                                                >
                                                    {option
                                                        .charAt(0)
                                                        .toUpperCase() +
                                                        option.slice(1)}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-5 py-4">
                                        <StatusBadge status={user.status} />
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {user.lastLoginAt
                                            ? dateFormatter.format(
                                                  new Date(
                                                      `${user.lastLoginAt}T00:00:00`
                                                  )
                                              )
                                            : "Never"}
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex flex-wrap items-center gap-3">
                                            {user.status === "suspended" ? (
                                                <button
                                                    type="button"
                                                    className="text-label-sm text-blue-500 hover:text-blue-600"
                                                    onClick={() =>
                                                        setUserStatus(
                                                            user.id,
                                                            "active"
                                                        )
                                                    }
                                                >
                                                    Activate
                                                </button>
                                            ) : user.status === "active" ? (
                                                <button
                                                    type="button"
                                                    className="text-label-sm text-red-500 hover:text-red-600"
                                                    onClick={() =>
                                                        setUserStatus(
                                                            user.id,
                                                            "suspended"
                                                        )
                                                    }
                                                >
                                                    Suspend
                                                </button>
                                            ) : null}
                                            {user.status === "pending" && (
                                                <button
                                                    type="button"
                                                    className="text-label-sm text-blue-500 hover:text-blue-600"
                                                    onClick={() =>
                                                        onResend(user.id)
                                                    }
                                                >
                                                    Resend invite
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filtered.length === 0 && (
                    <div className="px-5 py-12 text-center">
                        <p className="text-label-sm text-strong-950">
                            No team members found
                        </p>
                    </div>
                )}

                <div className="border-t border-stroke-soft-200 px-5 py-3 text-label-xs text-sub-600">
                    Showing {filtered.length} of {users.length} members
                </div>
            </section>
        </div>
    );
};

export default TeamPage;
