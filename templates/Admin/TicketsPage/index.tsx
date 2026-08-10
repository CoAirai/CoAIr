"use client";

import { useMemo, useState } from "react";

import { useAdminData } from "@/context/AdminDataContext";
import type { TicketPriority, TicketStatus } from "@/lib/admin/wave2Types";

const AGENTS = ["Unassigned", "Aisha Khan", "Marcus Lee", "Priya Rao"] as const;

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
});

const STATUS_CLASSES: Record<TicketStatus, string> = {
    open: "bg-orange-500/10 text-orange-600",
    resolved: "bg-green-500/10 text-green-600",
};

const PRIORITY_CLASSES: Record<TicketPriority, string> = {
    high: "bg-red-500/10 text-red-500",
    medium: "bg-blue-500/10 text-blue-500",
    low: "bg-weak-50 text-sub-600",
};

const TicketBadge = ({
    label,
    classes,
}: {
    label: string;
    classes: string;
}) => (
    <span
        className={`inline-flex h-6 items-center rounded-full px-2.5 text-label-xs ${classes}`}
    >
        {label}
    </span>
);

const TicketsPage = () => {
    const { tickets, companies, assignTicket, resolveTicket, reopenTicket } =
        useAdminData();

    const [search, setSearch] = useState("");
    const [status, setStatus] = useState<TicketStatus | "all">("all");
    const [priority, setPriority] = useState<TicketPriority | "all">("all");

    const companyName = (companyId: string) =>
        companies.find((c) => c.id === companyId)?.name ?? "Unknown company";

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return tickets.filter((t) => {
            if (
                q &&
                !t.subject.toLowerCase().includes(q) &&
                !companyName(t.companyId).toLowerCase().includes(q)
            )
                return false;
            if (status !== "all" && t.status !== status) return false;
            if (priority !== "all" && t.priority !== priority) return false;
            return true;
        });
    }, [tickets, search, status, priority, companies]);

    const openCount = tickets.filter((t) => t.status === "open").length;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">
                    Support tickets
                </h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    {openCount} open of {tickets.length} total. Assign, resolve,
                    or reopen tickets raised by company admins.
                </p>
            </div>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="grid gap-3 border-b border-stroke-soft-200 p-5 md:grid-cols-[minmax(240px,1fr)_180px_180px]">
                    <label className="block">
                        <span className="sr-only">Search tickets</span>
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by subject or company"
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-label-sm outline-none placeholder:text-sub-600 focus:border-blue-500"
                        />
                    </label>
                    <label className="block">
                        <span className="sr-only">Filter by status</span>
                        <select
                            value={status}
                            onChange={(e) =>
                                setStatus(
                                    e.target.value as TicketStatus | "all"
                                )
                            }
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        >
                            <option value="all">All statuses</option>
                            <option value="open">Open</option>
                            <option value="resolved">Resolved</option>
                        </select>
                    </label>
                    <label className="block">
                        <span className="sr-only">Filter by priority</span>
                        <select
                            value={priority}
                            onChange={(e) =>
                                setPriority(
                                    e.target.value as TicketPriority | "all"
                                )
                            }
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                        >
                            <option value="all">All priorities</option>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                        </select>
                    </label>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1100px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">
                                    Subject
                                </th>
                                <th className="px-5 py-3 font-medium">
                                    Company
                                </th>
                                <th className="px-5 py-3 font-medium">
                                    Priority
                                </th>
                                <th className="px-5 py-3 font-medium">
                                    Status
                                </th>
                                <th className="px-5 py-3 font-medium">
                                    Assignee
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
                            {filtered.map((ticket) => (
                                <tr key={ticket.id} className="text-label-sm">
                                    <td className="px-5 py-4 text-strong-950">
                                        {ticket.subject}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {companyName(ticket.companyId)}
                                    </td>
                                    <td className="px-5 py-4">
                                        <TicketBadge
                                            label={
                                                ticket.priority
                                                    .charAt(0)
                                                    .toUpperCase() +
                                                ticket.priority.slice(1)
                                            }
                                            classes={
                                                PRIORITY_CLASSES[
                                                    ticket.priority
                                                ]
                                            }
                                        />
                                    </td>
                                    <td className="px-5 py-4">
                                        <TicketBadge
                                            label={
                                                ticket.status
                                                    .charAt(0)
                                                    .toUpperCase() +
                                                ticket.status.slice(1)
                                            }
                                            classes={
                                                STATUS_CLASSES[ticket.status]
                                            }
                                        />
                                    </td>
                                    <td className="px-5 py-4">
                                        <select
                                            value={
                                                ticket.assigneeId ??
                                                "Unassigned"
                                            }
                                            onChange={(e) =>
                                                assignTicket(
                                                    ticket.id,
                                                    e.target.value ===
                                                        "Unassigned"
                                                        ? null
                                                        : e.target.value
                                                )
                                            }
                                            className="h-9 rounded-lg border border-stroke-soft-200 px-2.5 text-label-xs outline-none focus:border-blue-500"
                                        >
                                            {AGENTS.map((agent) => (
                                                <option key={agent} value={agent}>
                                                    {agent}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {dateFormatter.format(
                                            new Date(
                                                `${ticket.createdAt}T00:00:00`
                                            )
                                        )}
                                    </td>
                                    <td className="px-5 py-4">
                                        {ticket.status === "resolved" ? (
                                            <button
                                                type="button"
                                                className="text-label-sm text-blue-500 hover:text-blue-600"
                                                onClick={() =>
                                                    reopenTicket(ticket.id)
                                                }
                                            >
                                                Reopen
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="text-label-sm text-green-600 hover:text-green-700"
                                                onClick={() =>
                                                    resolveTicket(ticket.id)
                                                }
                                            >
                                                Resolve
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filtered.length === 0 && (
                    <div className="px-5 py-12 text-center">
                        <p className="text-label-sm text-strong-950">
                            No tickets found
                        </p>
                    </div>
                )}

                <div className="border-t border-stroke-soft-200 px-5 py-3 text-label-xs text-sub-600">
                    Showing {filtered.length} of {tickets.length} tickets
                </div>
            </section>
        </div>
    );
};

export default TicketsPage;
