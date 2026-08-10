"use client";

import { useMemo, useState } from "react";

import { useAdminData } from "@/context/AdminDataContext";
import type { AuditAction } from "@/lib/admin/types";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
});

const ACTION_LABELS: Record<AuditAction, string> = {
    "company.create": "Company created",
    "company.access_request": "Access requested",
    "company.access_approve": "Access request approved",
    "company.access_deny": "Access request denied",
    "company.suspend": "Company suspended",
    "company.activate": "Company activated",
    "company.plan_change": "Company plan changed",
    "company.addon": "Company add-on updated",
    "package.update": "Package updated",
    "user.suspend": "User suspended",
    "user.activate": "User activated",
    "user.invite": "User invited",
    "user.role_change": "User role changed",
    "user.impersonate": "User impersonated",
    "user.force_logout": "User force logged out",
    "tokens.credit": "Tokens credited",
    "tokens.debit": "Tokens debited",
    "billing.retry_invoice": "Invoice retried",
    "billing.refund": "Invoice refunded",
    "billing.coupon_create": "Coupon created",
    "billing.coupon_toggle": "Coupon toggled",
    "billing.tax_update": "Tax settings updated",
    "model.update": "AI model updated",
    "security.mfa": "MFA policy updated",
    "security.session_timeout": "Session timeout updated",
    "security.ip_add": "IP allowlist entry added",
    "security.ip_remove": "IP allowlist entry removed",
    "security.api_key_create": "API key created",
    "security.api_key_revoke": "API key revoked",
    "admin.password_change": "Admin password changed",
    "ticket.assign": "Ticket assigned",
    "ticket.resolve": "Ticket resolved",
    "ticket.reopen": "Ticket reopened",
    "ops.flag": "Feature flag updated",
    "ops.maintenance": "Maintenance mode updated",
    "ops.announcement_create": "Announcement created",
    "ops.announcement_publish": "Announcement published",
    "ops.announcement_archive": "Announcement archived",
};

const AuditPage = () => {
    const { auditLog } = useAdminData();
    const [action, setAction] = useState<AuditAction | "all">("all");

    const filtered = useMemo(
        () =>
            action === "all"
                ? auditLog
                : auditLog.filter((entry) => entry.action === action),
        [action, auditLog]
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Audit log</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Local trail of admin actions in this session (mock).
                </p>
            </div>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 p-5">
                    <label className="block max-w-xs">
                        <span className="sr-only">Filter by action</span>
                        <select
                            value={action}
                            onChange={(e) =>
                                setAction(e.target.value as AuditAction | "all")
                            }
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        >
                            <option value="all">All actions</option>
                            {Object.entries(ACTION_LABELS).map(([key, label]) => (
                                <option key={key} value={key}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">When</th>
                                <th className="px-5 py-3 font-medium">Action</th>
                                <th className="px-5 py-3 font-medium">Target</th>
                                <th className="px-5 py-3 font-medium">Detail</th>
                                <th className="px-5 py-3 font-medium">Actor</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {filtered.map((entry) => (
                                <tr key={entry.id} className="text-label-sm">
                                    <td className="px-5 py-4 text-sub-600">
                                        {dateTimeFormatter.format(
                                            new Date(entry.at)
                                        )}
                                    </td>
                                    <td className="px-5 py-4 text-strong-950">
                                        {ACTION_LABELS[entry.action]}
                                    </td>
                                    <td className="px-5 py-4 text-strong-950">
                                        {entry.targetLabel}
                                        <span className="mt-1 block text-label-xs text-sub-600">
                                            {entry.targetType}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {entry.detail}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {entry.actor}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filtered.length === 0 && (
                    <div className="px-5 py-12 text-center">
                        <p className="text-label-sm text-strong-950">
                            No audit events yet
                        </p>
                        <p className="mt-1 text-label-xs text-sub-600">
                            Create a company, suspend a user, or adjust tokens
                            to see entries here.
                        </p>
                    </div>
                )}

                <div className="border-t border-stroke-soft-200 px-5 py-3 text-label-xs text-sub-600">
                    Showing {filtered.length} of {auditLog.length} events
                </div>
            </section>
        </div>
    );
};

export default AuditPage;
