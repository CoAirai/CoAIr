"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import StatusBadge from "@/components/Admin/StatusBadge";
import OrgRoleSelect from "@/components/Admin/OrgRoleSelect";
import { useAuth } from "@/context/AuthContext";
import {
    addAdminOrgMember,
    createAdminUser,
    deleteAdminUser,
    forceLogoutAdminUser,
    resetAdminUserUsage,
} from "@/lib/coair/admin";
import { apiErrorMessage } from "@/lib/coair/commerce";
import { startLiveImpersonation } from "@/lib/coair/impersonate";
import { portalPush } from "@/lib/auth/portalNav";
import { useLiveAdmin } from "@/lib/coair/useLiveAdmin";

const LiveUsersPage = () => {
    const { session, applySession } = useAuth();
    const router = useRouter();
    const token = session?.accessToken ?? "";
    const { orgs, users, loading, error, setActive, refresh } = useLiveAdmin();
    const [search, setSearch] = useState("");
    const [companyId, setCompanyId] = useState("all");
    const [username, setUsername] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [orgId, setOrgId] = useState("");
    const [actionError, setActionError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const rows = useMemo(
        () =>
            users
                .map((user) => ({
                    username: user.username,
                    name: user.display_name || user.username,
                    company: user.org_name || "—",
                    companyId: user.org_id ?? "",
                    orgRole: user.org_role ?? "",
                    platformRole: user.role ?? "user",
                    status: user.is_active === false ? "suspended" : "active",
                }))
                .filter((user) => {
                    const query = search.trim().toLowerCase();
                    if (
                        query &&
                        !user.name.toLowerCase().includes(query) &&
                        !user.username.toLowerCase().includes(query)
                    ) {
                        return false;
                    }
                    if (companyId !== "all" && user.companyId !== companyId) {
                        return false;
                    }
                    return true;
                }),
        [companyId, search, users]
    );

    const ownerCountByOrg = useMemo(() => {
        const counts = new Map<string, number>();
        for (const user of users) {
            if (user.org_id && user.org_role === "owner") {
                counts.set(user.org_id, (counts.get(user.org_id) ?? 0) + 1);
            }
        }
        return counts;
    }, [users]);

    const onCreate = async (event: FormEvent) => {
        event.preventDefault();
        try {
            await createAdminUser(token, {
                username: username.trim(),
                display_name: displayName.trim() || undefined,
                org_id: orgId || undefined,
            });
            setUsername("");
            setDisplayName("");
            setMessage(`Invite sent to ${username.trim()}`);
            setActionError(null);
            await refresh();
        } catch (err) {
            setMessage(null);
            setActionError(apiErrorMessage(err));
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Users</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Live accounts from the API. Invite by email, set company
                    role here, and edit module rights on the company page.
                </p>
            </div>
            {error || actionError ? (
                <p className="text-label-sm text-red-500">
                    {actionError ?? error}
                </p>
            ) : null}
            {message ? (
                <p className="text-label-sm text-green-600">{message}</p>
            ) : null}

            <form
                onSubmit={(event) => void onCreate(event)}
                className="grid gap-3 rounded-2xl border border-stroke-soft-200 bg-white-0 p-5 md:grid-cols-2 xl:grid-cols-4"
            >
                <input
                    required
                    type="email"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Work email"
                    className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                />
                <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Display name"
                    className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                />
                <select
                    value={orgId}
                    onChange={(event) => setOrgId(event.target.value)}
                    className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                >
                    <option value="">No company</option>
                    {orgs.map((org) => (
                        <option key={org.org_id} value={org.org_id}>
                            {org.name}
                        </option>
                    ))}
                </select>
                <button
                    type="submit"
                    className="h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0"
                >
                    Invite user
                </button>
            </form>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="grid gap-3 border-b border-stroke-soft-200 p-5 md:grid-cols-2">
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search by name or username"
                        className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                    />
                    <select
                        value={companyId}
                        onChange={(event) => setCompanyId(event.target.value)}
                        className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                    >
                        <option value="all">All companies</option>
                        {orgs.map((org) => (
                            <option key={org.org_id} value={org.org_id}>
                                {org.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[960px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">Name</th>
                                <th className="px-5 py-3 font-medium">
                                    Username
                                </th>
                                <th className="px-5 py-3 font-medium">
                                    Company
                                </th>
                                <th className="px-5 py-3 font-medium">Role</th>
                                <th className="px-5 py-3 font-medium">Status</th>
                                <th className="px-5 py-3 font-medium">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {loading && rows.length === 0 ? (
                                <tr>
                                    <td
                                        className="px-5 py-4 text-label-sm text-sub-600"
                                        colSpan={6}
                                    >
                                        Loading users…
                                    </td>
                                </tr>
                            ) : null}
                            {rows.map((user) => (
                                <tr
                                    key={user.username}
                                    className="text-label-sm"
                                >
                                    <td className="px-5 py-4 text-strong-950">
                                        {user.name}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {user.username}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {user.companyId ? (
                                            <Link
                                                href={`/admin/companies/${user.companyId}?tab=users`}
                                                className="hover:text-blue-500"
                                            >
                                                {user.company}
                                            </Link>
                                        ) : (
                                            user.company
                                        )}
                                    </td>
                                    <td className="px-5 py-4 capitalize text-sub-600">
                                        {user.companyId ? (
                                            <OrgRoleSelect
                                                value={user.orgRole || "member"}
                                                disabled={
                                                    user.orgRole === "owner" &&
                                                    (ownerCountByOrg.get(
                                                        user.companyId
                                                    ) ?? 0) <= 1
                                                }
                                                onChange={(role) =>
                                                    void addAdminOrgMember(
                                                        token,
                                                        user.companyId,
                                                        user.username,
                                                        role
                                                    )
                                                        .then(() => {
                                                            setMessage(
                                                                `Role updated for ${user.username}`
                                                            );
                                                            return refresh();
                                                        })
                                                        .catch((err) =>
                                                            setActionError(
                                                                apiErrorMessage(
                                                                    err
                                                                )
                                                            )
                                                        )
                                                }
                                            />
                                        ) : (
                                            user.platformRole
                                        )}
                                    </td>
                                    <td className="px-5 py-4">
                                        <StatusBadge status={user.status} />
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex flex-wrap gap-3">
                                            <button
                                                type="button"
                                                className="text-label-xs text-blue-500"
                                                onClick={() =>
                                                    void setActive(
                                                        user.username,
                                                        user.status ===
                                                            "suspended"
                                                    )
                                                }
                                            >
                                                {user.status === "suspended"
                                                    ? "Reactivate"
                                                    : "Deactivate"}
                                            </button>
                                            <button
                                                type="button"
                                                className="text-label-xs text-blue-500"
                                                onClick={() =>
                                                    void startLiveImpersonation(
                                                        {
                                                            adminSession:
                                                                session!,
                                                            token,
                                                            username:
                                                                user.username,
                                                            applySession,
                                                        }
                                                    )
                                                        .then(({ href }) =>
                                                            portalPush(
                                                                router,
                                                                href
                                                            )
                                                        )
                                                        .catch((err) =>
                                                            setActionError(
                                                                apiErrorMessage(
                                                                    err
                                                                )
                                                            )
                                                        )
                                                }
                                            >
                                                Impersonate
                                            </button>
                                            <button
                                                type="button"
                                                className="text-label-xs text-sub-600"
                                                onClick={() =>
                                                    void forceLogoutAdminUser(
                                                        token,
                                                        user.username
                                                    )
                                                        .then(() =>
                                                            setMessage(
                                                                `Forced logout for ${user.username}`
                                                            )
                                                        )
                                                        .catch((err) =>
                                                            setActionError(
                                                                apiErrorMessage(
                                                                    err
                                                                )
                                                            )
                                                        )
                                                }
                                            >
                                                Force logout
                                            </button>
                                            <button
                                                type="button"
                                                className="text-label-xs text-sub-600"
                                                onClick={() =>
                                                    void resetAdminUserUsage(
                                                        token,
                                                        user.username
                                                    )
                                                        .then(() => {
                                                            setMessage(
                                                                `Reset usage for ${user.username}`
                                                            );
                                                            return refresh();
                                                        })
                                                        .catch((err) =>
                                                            setActionError(
                                                                apiErrorMessage(
                                                                    err
                                                                )
                                                            )
                                                        )
                                                }
                                            >
                                                Reset usage
                                            </button>
                                            <button
                                                type="button"
                                                className="text-label-xs text-red-500"
                                                onClick={() =>
                                                    void deleteAdminUser(
                                                        token,
                                                        user.username
                                                    )
                                                        .then(() => {
                                                            setMessage(
                                                                `Deleted ${user.username}`
                                                            );
                                                            return refresh();
                                                        })
                                                        .catch((err) =>
                                                            setActionError(
                                                                apiErrorMessage(
                                                                    err
                                                                )
                                                            )
                                                        )
                                                }
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!loading && rows.length === 0 ? (
                                <tr>
                                    <td
                                        className="px-5 py-4 text-label-sm text-sub-600"
                                        colSpan={6}
                                    >
                                        No users yet.
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

export default LiveUsersPage;
