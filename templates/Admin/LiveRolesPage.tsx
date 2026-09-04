"use client";

import Link from "next/link";

import PageHeader from "@/components/Admin/PageHeader";
import RightsToggleCells from "@/components/Admin/RightsToggleCells";
import {
    RIGHT_COLUMNS,
    ROLE_DEFINITIONS,
    rightsForRole,
} from "@/lib/admin/rolesStub";

const LiveRolesPage = () => {
    const rows = ROLE_DEFINITIONS.map((role) => ({
        ...role,
        rights: rightsForRole(role.roleKey),
    }));

    return (
        <div className="space-y-6">
            <PageHeader
                title="Roles & Rights"
                description="What each role can do by default. Assign people on Users or a company page — this screen is the capability matrix only."
            />

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[880px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">Role</th>
                                <th className="px-5 py-3 font-medium">Scope</th>
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
                            {rows.map((row) => (
                                <tr key={row.id} className="text-label-sm">
                                    <td className="px-5 py-4">
                                        <p className="text-strong-950">
                                            {row.name}
                                        </p>
                                        <p className="mt-1 text-label-xs text-sub-600">
                                            {row.description}
                                        </p>
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {row.scope}
                                    </td>
                                    <RightsToggleCells rights={row.rights} />
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="border-t border-stroke-soft-200 px-5 py-4 text-label-sm text-sub-600">
                    Assign people on{" "}
                    <Link
                        href="/admin/users"
                        className="text-blue-500 hover:text-blue-600"
                    >
                        Users
                    </Link>{" "}
                    or a company page. Per-member module overrides are edited
                    on that company&apos;s Users tab.
                </div>
            </section>
        </div>
    );
};

export default LiveRolesPage;
