"use client";

import { useMemo, useState } from "react";
import PageHeader from "@/components/Admin/PageHeader";
import OrgRoleSelect from "@/components/Admin/OrgRoleSelect";
import RightsToggleCells from "@/components/Admin/RightsToggleCells";
import { useAuth } from "@/context/AuthContext";
import {
    RIGHT_COLUMNS,
    rightsFromFeatures,
    toggleRightInFeatures,
    type OrgRole,
    type RightKey,
} from "@/lib/admin/rolesStub";
import {
    addAdminOrgMember,
    patchAdminUser,
} from "@/lib/coair/admin";
import { apiErrorMessage } from "@/lib/coair/commerce";
import { useLiveAdmin } from "@/lib/coair/useLiveAdmin";

const LiveRolesPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const { users, loading, error, refresh } = useLiveAdmin();
    const [actionError, setActionError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const ownerCountByOrg = useMemo(() => {
        const counts = new Map<string, number>();
        for (const user of users) {
            if (user.org_id && user.org_role === "owner") {
                counts.set(user.org_id, (counts.get(user.org_id) ?? 0) + 1);
            }
        }
        return counts;
    }, [users]);

    const rows = useMemo(
        () =>
            users.map((user) => {
                const role = user.org_role || user.role || "member";
                return {
                    username: user.username,
                    name: user.display_name || user.username,
                    companyName: user.org_name || "—",
                    companyId: user.org_id ?? "",
                    orgRole: user.org_role ?? "",
                    role,
                    features: user.features ?? {},
                    rights: rightsFromFeatures(user.features, role),
                };
            }),
        [users]
    );

    const changeRole = async (username: string, orgId: string, role: OrgRole) => {
        try {
            await addAdminOrgMember(token, orgId, username, role);
            setMessage(`Role updated for ${username}`);
            setActionError(null);
            await refresh();
        } catch (err) {
            setMessage(null);
            setActionError(apiErrorMessage(err));
        }
    };

    const toggleRight = async (
        username: string,
        features: Record<string, boolean>,
        role: string,
        key: RightKey,
        enabled: boolean
    ) => {
        try {
            await patchAdminUser(token, username, {
                features: toggleRightInFeatures(features, role, key, enabled),
            });
            setMessage(`Rights updated for ${username}`);
            setActionError(null);
            await refresh();
        } catch (err) {
            setMessage(null);
            setActionError(apiErrorMessage(err));
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Roles & Rights"
                description="Change company role and grant or revoke module rights on live accounts. Last company admin cannot be demoted."
            />
            {error || actionError ? (
                <p className="text-label-sm text-red-500">
                    {actionError ?? error}
                </p>
            ) : null}
            {message ? (
                <p className="text-label-sm text-green-600">{message}</p>
            ) : null}
            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1080px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">User</th>
                                <th className="px-5 py-3 font-medium">
                                    Company
                                </th>
                                <th className="px-5 py-3 font-medium">Role</th>
                                {RIGHT_COLUMNS.map((column) => (
                                    <th
                                        key={column.key}
                                        className="px-5 py-3 text-center font-medium"
                                    >
                                        {column.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {loading && rows.length === 0 ? (
                                <tr>
                                    <td
                                        className="px-5 py-4 text-label-sm text-sub-600"
                                        colSpan={9}
                                    >
                                        Loading roles…
                                    </td>
                                </tr>
                            ) : null}
                            {rows.map((row) => (
                                <tr key={row.username} className="text-label-sm">
                                    <td className="px-5 py-4">
                                        <span className="block text-strong-950">
                                            {row.name}
                                        </span>
                                        <span className="block text-label-xs text-sub-600">
                                            {row.username}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {row.companyName}
                                    </td>
                                    <td className="px-5 py-4">
                                        {row.companyId ? (
                                            <OrgRoleSelect
                                                value={row.orgRole || "member"}
                                                disabled={
                                                    row.orgRole === "owner" &&
                                                    (ownerCountByOrg.get(
                                                        row.companyId
                                                    ) ?? 0) <= 1
                                                }
                                                onChange={(role) =>
                                                    void changeRole(
                                                        row.username,
                                                        row.companyId,
                                                        role
                                                    )
                                                }
                                            />
                                        ) : (
                                            <span className="capitalize text-sub-600">
                                                {row.role}
                                            </span>
                                        )}
                                    </td>
                                    <RightsToggleCells
                                        rights={row.rights}
                                        onToggle={(key, enabled) =>
                                            void toggleRight(
                                                row.username,
                                                row.features,
                                                row.role,
                                                key,
                                                enabled
                                            )
                                        }
                                    />
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};

export default LiveRolesPage;
