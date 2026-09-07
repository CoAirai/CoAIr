"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import PageHeader from "@/components/Admin/PageHeader";
import { useAuth } from "@/context/AuthContext";
import {
    listAdminQueries,
    type CoairAdminQueryRow,
} from "@/lib/coair/admin";
import { apiErrorMessage } from "@/lib/coair/commerce";

const numberFormatter = new Intl.NumberFormat("en-US");
const caFormatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
});
const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6,
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
});

const LiveQueriesPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const [rows, setRows] = useState<CoairAdminQueryRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [username, setUsername] = useState("");
    const [orgId, setOrgId] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    const refresh = useCallback(async () => {
        if (!token) {
            setRows([]);
            setTotal(0);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const payload = await listAdminQueries(token, {
                username: username.trim() || undefined,
                orgId: orgId.trim() || undefined,
                dateFrom: dateFrom.trim() || undefined,
                dateTo: dateTo.trim() || undefined,
                limit: 200,
            });
            setRows(payload.entries ?? []);
            setTotal(payload.total ?? 0);
            setError(null);
        } catch (err) {
            setError(apiErrorMessage(err));
        } finally {
            setLoading(false);
        }
    }, [token, username, orgId, dateFrom, dateTo]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const onFilter = (event: FormEvent) => {
        event.preventDefault();
        void refresh();
    };

    return (
        <div className="page-stack">
            <PageHeader
                title="Queries"
                description="Each LLM call: CA tokens charged (from Gemini $ cost) and raw Gemini input/output tokens."
            />
            {error ? (
                <p className="text-label-sm text-red-500">{error}</p>
            ) : null}

            <form
                onSubmit={onFilter}
                className="surface-panel grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-5"
            >
                <label className="block">
                    <span className="mb-1.5 block text-label-xs text-sub-600">
                        Username
                    </span>
                    <input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        placeholder="optional"
                    />
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-label-xs text-sub-600">
                        Company org id
                    </span>
                    <input
                        value={orgId}
                        onChange={(e) => setOrgId(e.target.value)}
                        className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        placeholder="optional"
                    />
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-label-xs text-sub-600">
                        From (ISO)
                    </span>
                    <input
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        placeholder="2026-01-01"
                    />
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-label-xs text-sub-600">
                        To (ISO)
                    </span>
                    <input
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        placeholder="2026-12-31"
                    />
                </label>
                <div className="flex items-end">
                    <button
                        type="submit"
                        className="h-10 w-full rounded-full bg-strong-950 px-4 text-label-sm text-white-0 hover:opacity-90"
                    >
                        Apply filters
                    </button>
                </div>
            </form>

            <section className="overflow-hidden rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 px-5 py-4">
                    <h2 className="text-label-lg text-strong-950">
                        {loading ? "Loading…" : `${numberFormatter.format(total)} calls`}
                    </h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1100px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">When</th>
                                <th className="px-5 py-3 font-medium">Customer</th>
                                <th className="px-5 py-3 font-medium">Model</th>
                                <th className="px-5 py-3 font-medium">
                                    Gemini in
                                </th>
                                <th className="px-5 py-3 font-medium">
                                    Gemini out
                                </th>
                                <th className="px-5 py-3 font-medium">CA used</th>
                                <th className="px-5 py-3 font-medium">
                                    Provider $
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {rows.map((row) => (
                                <tr key={row.event_id} className="text-label-sm">
                                    <td className="px-5 py-4 text-sub-600">
                                        {dateTimeFormatter.format(
                                            new Date(row.created_at)
                                        )}
                                    </td>
                                    <td className="px-5 py-4 text-strong-950">
                                        {row.username}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {row.model || "—"}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {numberFormatter.format(
                                            row.gemini_input_tokens ??
                                                row.prompt_tokens ??
                                                0
                                        )}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {numberFormatter.format(
                                            row.gemini_output_tokens ??
                                                row.completion_tokens ??
                                                0
                                        )}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {caFormatter.format(row.ca_tokens ?? 0)}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {currencyFormatter.format(
                                            row.provider_cost_usd ?? 0
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {!loading && rows.length === 0 ? (
                                <tr>
                                    <td
                                        className="px-5 py-8 text-center text-label-sm text-sub-600"
                                        colSpan={7}
                                    >
                                        No query charges yet.
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

export default LiveQueriesPage;
