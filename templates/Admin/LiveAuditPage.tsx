"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/context/AuthContext";
import PreviewBanner from "@/components/Admin/PreviewBanner";
import { SEED_AUDIT } from "@/lib/admin/auditSeed";
import { AUDIT_ACTION_LABELS } from "@/lib/admin/auditLabels";
import { withPreview } from "@/lib/admin/preview";
import type { AuditAction, AuditEntry } from "@/lib/admin/types";
import { apiErrorMessage } from "@/lib/coair/commerce";
import { listAudit } from "@/lib/coair/ops";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
});

const LiveAuditPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const [action, setAction] = useState<AuditAction | "all">("all");
    const [events, setEvents] = useState<AuditEntry[]>([]);
    const [eventsReady, setEventsReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!token) return;
        try {
            setEvents(await listAudit(token, action));
            setError(null);
        } catch (err) {
            setError(apiErrorMessage(err));
        } finally {
            setEventsReady(true);
        }
    }, [action, token]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const { rows: eventRows, preview } = withPreview(
        events,
        SEED_AUDIT,
        eventsReady
    );
    const visible = eventRows.filter(
        (entry) => action === "all" || entry.action === action
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Audit log</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Live trail of admin and company actions.
                </p>
            </div>
            {error ? (
                <p className="text-label-sm text-red-500">{error}</p>
            ) : null}
            {preview ? <PreviewBanner /> : null}

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 p-5">
                    <label className="block max-w-xs">
                        <span className="sr-only">Filter by action</span>
                        <select
                            value={action}
                            onChange={(event) =>
                                setAction(event.target.value as AuditAction | "all")
                            }
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        >
                            <option value="all">All actions</option>
                            {Object.entries(AUDIT_ACTION_LABELS).map(([key, label]) => (
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
                            {visible.map((entry) => (
                                <tr key={entry.id} className="text-label-sm">
                                    <td className="px-5 py-4 text-sub-600">
                                        {dateTimeFormatter.format(new Date(entry.at))}
                                    </td>
                                    <td className="px-5 py-4 text-strong-950">
                                        {AUDIT_ACTION_LABELS[entry.action] ??
                                            entry.action}
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
                {visible.length === 0 ? (
                    <div className="px-5 py-12 text-center">
                        <p className="text-label-sm text-strong-950">
                            No audit events yet
                        </p>
                    </div>
                ) : null}
                <div className="border-t border-stroke-soft-200 px-5 py-3 text-label-xs text-sub-600">
                    Showing {visible.length} events
                </div>
            </section>
        </div>
    );
};

export default LiveAuditPage;
