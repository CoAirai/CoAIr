"use client";

import { useMemo } from "react";
import PageHeader from "@/components/Admin/PageHeader";
import OrgRoleSelect from "@/components/Admin/OrgRoleSelect";
import RightsToggleCells from "@/components/Admin/RightsToggleCells";
import { useAdminData } from "@/context/AdminDataContext";
import type { UserRole } from "@/lib/admin/types";
import {
    RIGHT_COLUMNS,
    rightsFromFeatures,
    type OrgRole,
    type RightKey,
} from "@/lib/admin/rolesStub";

const orgRoleToUserRole = (role: OrgRole): UserRole =>
    role === "owner" ? "admin" : "member";

const RolesPage = () => {
    const { companies, users, setUserRole, setUserRights } = useAdminData();
    const companyById = useMemo(
        () => new Map(companies.map((company) => [company.id, company.name])),
        [companies]
    );

    return (
        <div className="space-y-6">
            <PageHeader
                title="Roles & Rights"
                description="Change company role and grant or revoke module rights."
            />
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
                            {users.map((user) => {
                                const orgRole: OrgRole =
                                    user.role === "admin" ? "owner" : "member";
                                const rights = {
                                    ...rightsFromFeatures(undefined, user.role),
                                    ...user.rights,
                                };
                                return (
                                    <tr key={user.id} className="text-label-sm">
                                        <td className="px-5 py-4">
                                            <span className="block text-strong-950">
                                                {user.name}
                                            </span>
                                            <span className="block text-label-xs text-sub-600">
                                                {user.email}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-sub-600">
                                            {companyById.get(user.companyId) ??
                                                user.companyId}
                                        </td>
                                        <td className="px-5 py-4">
                                            <OrgRoleSelect
                                                value={orgRole}
                                                onChange={(role) =>
                                                    setUserRole(
                                                        user.id,
                                                        orgRoleToUserRole(role)
                                                    )
                                                }
                                            />
                                        </td>
                                        <RightsToggleCells
                                            rights={rights}
                                            onToggle={(key: RightKey, enabled) =>
                                                setUserRights(user.id, {
                                                    [key]: enabled,
                                                })
                                            }
                                        />
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {users.length === 0 ? (
                    <div className="px-5 py-10 text-center text-label-sm text-sub-600">
                        No users to show rights for yet.
                    </div>
                ) : null}
            </section>
        </div>
    );
};

export default RolesPage;
