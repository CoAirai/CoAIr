"use client";

import { useMemo, useState } from "react";

import StatusBadge from "@/components/Admin/StatusBadge";
import { useAdminData } from "@/context/AdminDataContext";
import { filterUsers } from "@/lib/admin/selectors";
import type { UserRole, UserStatus } from "@/lib/admin/types";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
});

const ROLE_OPTIONS: UserRole[] = ["admin", "member", "viewer"];

const UsersPage = () => {
    const {
        companies,
        users,
        setUserStatus,
        setUserRole,
        impersonateUser,
        stopImpersonation,
        forceLogoutUser,
        impersonatingUserId,
    } = useAdminData();
    const [search, setSearch] = useState("");
    const [companyId, setCompanyId] = useState<string | "all">("all");
    const [status, setStatus] = useState<UserStatus | "all">("all");

    const companyById = useMemo(
        () => new Map(companies.map((company) => [company.id, company])),
        [companies]
    );

    const filtered = useMemo(
        () => filterUsers(users, { search, companyId, status }),
        [companyId, search, status, users]
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Users</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Oversight only — companies invite their own users. Manage
                    roles, suspend access, impersonate, or force logout.
                </p>
            </div>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="grid gap-3 border-b border-stroke-soft-200 p-5 md:grid-cols-[minmax(240px,1fr)_200px_200px]">
                    <label className="block">
                        <span className="sr-only">Search users</span>
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by name or email"
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none placeholder:text-sub-600 focus:border-blue-500"
                        />
                    </label>
                    <label className="block">
                        <span className="sr-only">Filter by company</span>
                        <select
                            value={companyId}
                            onChange={(e) =>
                                setCompanyId(e.target.value as string | "all")
                            }
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        >
                            <option value="all">All companies</option>
                            {companies.map((company) => (
                                <option key={company.id} value={company.id}>
                                    {company.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="sr-only">Filter by status</span>
                        <select
                            value={status}
                            onChange={(e) =>
                                setStatus(e.target.value as UserStatus | "all")
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
                    <table className="w-full min-w-[1280px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">Name</th>
                                <th className="px-5 py-3 font-medium">Email</th>
                                <th className="px-5 py-3 font-medium">
                                    Company
                                </th>
                                <th className="px-5 py-3 font-medium">Role</th>
                                <th className="px-5 py-3 font-medium">Status</th>
                                <th className="px-5 py-3 font-medium">
                                    Last login
                                </th>
                                <th className="px-5 py-3 font-medium">
                                    Created
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
                                        {companyById.get(user.companyId)
                                            ?.name ?? "Unknown"}
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
                                            {ROLE_OPTIONS.map((role) => (
                                                <option key={role} value={role}>
                                                    {role.charAt(0).toUpperCase() +
                                                        role.slice(1)}
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
                                    <td className="px-5 py-4 text-sub-600">
                                        {dateFormatter.format(
                                            new Date(
                                                `${user.createdAt}T00:00:00`
                                            )
                                        )}
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
                                            ) : (
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
                                            )}
                                            {impersonatingUserId === user.id ? (
                                                <button
                                                    type="button"
                                                    className="text-label-sm text-sub-600 hover:text-strong-950"
                                                    onClick={stopImpersonation}
                                                >
                                                    Stop impersonating
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="text-label-sm text-sub-600 hover:text-strong-950"
                                                    onClick={() =>
                                                        impersonateUser(user.id)
                                                    }
                                                >
                                                    Impersonate
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className="text-label-sm text-sub-600 hover:text-strong-950"
                                                onClick={() =>
                                                    forceLogoutUser(user.id)
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

                {filtered.length === 0 && (
                    <div className="px-5 py-12 text-center">
                        <p className="text-label-sm text-strong-950">
                            No users found
                        </p>
                    </div>
                )}

                <div className="border-t border-stroke-soft-200 px-5 py-3 text-label-xs text-sub-600">
                    Showing {filtered.length} of {users.length} users
                </div>
            </section>
        </div>
    );
};

export default UsersPage;
