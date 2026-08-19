"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { downloadPdf } from "@/lib/admin/exportPdf";
import { bytesToGb, planLabel } from "@/lib/admin/liveHelpers";
import type { Invoice } from "@/lib/admin/billingTypes";
import { useAuth } from "@/context/AuthContext";
import { listAdminInvoices } from "@/lib/coair/ops";
import { useLiveAdmin } from "@/lib/coair/useLiveAdmin";

const downloadCsv = (filename: string, rows: Record<string, string>[]) => {
    const headers = Object.keys(rows[0] ?? { Note: "empty" });
    const csv = [
        headers.join(","),
        ...rows.map((row) =>
            headers
                .map((header) => `"${String(row[header] ?? "").replaceAll('"', '""')}"`)
                .join(",")
        ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

const LiveReportsPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const { orgs, users, groups, loading, error } = useLiveAdmin();
    const [invoices, setInvoices] = useState<Invoice[]>([]);

    const loadInvoices = useCallback(async () => {
        if (!token) return;
        try {
            setInvoices(await listAdminInvoices(token));
        } catch {
            setInvoices([]);
        }
    }, [token]);

    useEffect(() => {
        void loadInvoices();
    }, [loadInvoices]);

    const usageRows = useMemo(
        () =>
            orgs.map((org) => {
                const members = users.filter((user) => user.org_id === org.org_id);
                return {
                    Company: org.name,
                    Plan: planLabel(org.default_plan_type),
                    Users: String(members.length),
                    Tokens: String(
                        members.reduce((sum, user) => sum + (user.used_tokens ?? 0), 0)
                    ),
                    StorageGB: String(
                        bytesToGb(
                            members.reduce(
                                (sum, user) => sum + (user.storage_used_bytes ?? 0),
                                0
                            )
                        )
                    ),
                    Status: org.archived_at ? "suspended" : "active",
                };
            }),
        [orgs, users]
    );

    const billingRows = useMemo(
        () =>
            invoices.map((invoice) => ({
                Invoice: invoice.id,
                Company:
                    orgs.find((org) => org.org_id === invoice.companyId)?.name ??
                    invoice.companyId,
                Status: invoice.status,
                AmountUSD: String(invoice.amountUsd),
            })),
        [invoices, orgs]
    );

    const spendRows = useMemo(
        () =>
            groups.map((group) => ({
                User: group.username ?? "",
                Model: group.model ?? "",
                Calls: String(group.calls ?? 0),
                ProviderUSD: String(group.estimated_provider_cost_usd ?? 0),
            })),
        [groups]
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Reports</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Export live companies, invoices, and usage as CSV or PDF.
                </p>
            </div>
            {error ? (
                <p className="text-label-sm text-red-500">{error}</p>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
                {[
                    {
                        id: "usage",
                        title: "Company usage",
                        description: "Tokens, storage, and seats per live company.",
                        rows: usageRows,
                    },
                    {
                        id: "billing",
                        title: "Invoices",
                        description: "Current invoice snapshot from the ops store.",
                        rows: billingRows,
                    },
                    {
                        id: "spend",
                        title: "Usage groups",
                        description: "Calls and estimated provider cost by user/model.",
                        rows: spendRows,
                    },
                ].map((report) => (
                    <article
                        key={report.id}
                        className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5"
                    >
                        <h2 className="text-label-lg text-strong-950">
                            {report.title}
                        </h2>
                        <p className="mt-2 text-label-sm text-sub-600">
                            {report.description}
                        </p>
                        <div className="mt-5 flex flex-wrap gap-2">
                            <button
                                type="button"
                                disabled={loading}
                                onClick={() =>
                                    downloadCsv(`coair-${report.id}.csv`, report.rows)
                                }
                                className="h-9 rounded-xl bg-blue-500 px-3 text-label-sm text-white-0 hover:bg-blue-600 disabled:opacity-50"
                            >
                                Download CSV
                            </button>
                            <button
                                type="button"
                                disabled={loading}
                                onClick={() =>
                                    downloadPdf(
                                        `coair-${report.id}.pdf`,
                                        report.title,
                                        report.rows
                                    )
                                }
                                className="h-9 rounded-xl border border-stroke-soft-200 px-3 text-label-sm text-strong-950 hover:bg-weak-50 disabled:opacity-50"
                            >
                                Download PDF
                            </button>
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
};

export default LiveReportsPage;
