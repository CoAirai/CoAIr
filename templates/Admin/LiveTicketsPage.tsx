"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { AdminTicketsTableSkeleton } from "@/components/Skeleton/sections";
import { useAuth } from "@/context/AuthContext";
import {
    apiErrorMessage,
    listAdminTickets,
    patchAdminTicket,
} from "@/lib/coair/commerce";
import { listAdminUsers, type CoairAdminUser } from "@/lib/coair/admin";
import { useLiveAdmin } from "@/lib/coair/useLiveAdmin";
import type { SupportTicket, TicketPriority, TicketStatus } from "@/lib/admin/wave2Types";

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

const LiveTicketsPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const { orgs } = useLiveAdmin();
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [operators, setOperators] = useState<CoairAdminUser[]>([]);
    const [ticketsReady, setTicketsReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState<TicketStatus | "all">("all");
    const [priority, setPriority] = useState<TicketPriority | "all">("all");
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!token) {
            setTickets([]);
            setOperators([]);
            setTicketsReady(true);
            return;
        }
        try {
            const [ticketRows, userPayload] = await Promise.all([
                listAdminTickets(token),
                listAdminUsers(token),
            ]);
            setTickets(ticketRows);
            setOperators(
                (userPayload.users ?? []).filter((user) =>
                    ["admin", "superadmin"].includes(
                        String(user.role || "").toLowerCase()
                    )
                )
            );
            setError(null);
        } catch (err) {
            setError(apiErrorMessage(err));
        } finally {
            setTicketsReady(true);
        }
    }, [token]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const companyName = (companyId: string) =>
        orgs.find((org) => org.org_id === companyId)?.name ?? "Unknown company";

    const agentOptions = useMemo(() => {
        const byId = new Map<string, string>();
        for (const user of operators) {
            const id = user.username;
            byId.set(
                id,
                user.display_name?.trim()
                    ? `${user.display_name} (${id})`
                    : id
            );
        }
        for (const ticket of tickets) {
            if (ticket.assigneeId && !byId.has(ticket.assigneeId)) {
                byId.set(ticket.assigneeId, ticket.assigneeId);
            }
        }
        return [
            { id: "", label: "Unassigned" },
            ...Array.from(byId.entries())
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(([id, label]) => ({ id, label })),
        ];
    }, [operators, tickets]);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return tickets.filter((ticket) => {
            if (
                query &&
                !ticket.subject.toLowerCase().includes(query) &&
                !(ticket.message || "").toLowerCase().includes(query) &&
                !companyName(ticket.companyId).toLowerCase().includes(query)
            ) {
                return false;
            }
            if (status !== "all" && ticket.status !== status) return false;
            if (priority !== "all" && ticket.priority !== priority) return false;
            return true;
        });
    }, [tickets, search, status, priority, orgs]);

    const openCount = tickets.filter((ticket) => ticket.status === "open").length;

    const assign = async (ticketId: string, assigneeId: string | null) => {
        try {
            const next = await patchAdminTicket(token, ticketId, {
                assignee_id: assigneeId,
            });
            setTickets((prev) =>
                prev.map((ticket) => (ticket.id === ticketId ? next : ticket))
            );
        } catch (err) {
            setError(apiErrorMessage(err));
        }
    };

    const setTicketStatus = async (ticketId: string, nextStatus: TicketStatus) => {
        try {
            const next = await patchAdminTicket(token, ticketId, {
                status: nextStatus,
            });
            setTickets((prev) =>
                prev.map((ticket) => (ticket.id === ticketId ? next : ticket))
            );
        } catch (err) {
            setError(apiErrorMessage(err));
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Support tickets</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    {openCount} open of {tickets.length} total. Assign, resolve,
                    or reopen tickets raised by company admins.
                </p>
            </div>
            {error ? <p className="text-label-sm text-red-500">{error}</p> : null}

            <AdminTicketsTableSkeleton
                loading={!ticketsReady && tickets.length === 0}
            >
                <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                    <div className="grid gap-3 border-b border-stroke-soft-200 p-5 md:grid-cols-[minmax(240px,1fr)_180px_180px]">
                        <label className="block">
                            <span className="sr-only">Search tickets</span>
                            <input
                                type="search"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search by subject, message, or company"
                                className="h-10 w-full rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-label-sm outline-none placeholder:text-sub-600 focus:border-blue-500"
                            />
                        </label>
                        <label className="block">
                            <span className="sr-only">Filter by status</span>
                            <select
                                value={status}
                                onChange={(event) =>
                                    setStatus(
                                        event.target.value as TicketStatus | "all"
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
                                onChange={(event) =>
                                    setPriority(
                                        event.target.value as TicketPriority | "all"
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
                                    <th className="px-5 py-3 font-medium">Subject</th>
                                    <th className="px-5 py-3 font-medium">Company</th>
                                    <th className="px-5 py-3 font-medium">Priority</th>
                                    <th className="px-5 py-3 font-medium">Status</th>
                                    <th className="px-5 py-3 font-medium">Assignee</th>
                                    <th className="px-5 py-3 font-medium">Created</th>
                                    <th className="px-5 py-3 font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stroke-soft-200">
                                {filtered.map((ticket) => {
                                    const open = expandedId === ticket.id;
                                    return (
                                        <Fragment key={ticket.id}>
                                            <tr className="text-label-sm">
                                                <td className="px-5 py-4 text-strong-950">
                                                    <button
                                                        type="button"
                                                        className="text-left hover:text-blue-600"
                                                        onClick={() =>
                                                            setExpandedId(
                                                                open
                                                                    ? null
                                                                    : ticket.id
                                                            )
                                                        }
                                                    >
                                                        {ticket.subject}
                                                        <span className="mt-1 block text-label-xs text-sub-600">
                                                            {open
                                                                ? "Hide message"
                                                                : "View message"}
                                                        </span>
                                                    </button>
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
                                                            ticket.priority.slice(
                                                                1
                                                            )
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
                                                            STATUS_CLASSES[
                                                                ticket.status
                                                            ]
                                                        }
                                                    />
                                                </td>
                                                <td className="px-5 py-4">
                                                    <select
                                                        value={
                                                            ticket.assigneeId ?? ""
                                                        }
                                                        onChange={(event) =>
                                                            void assign(
                                                                ticket.id,
                                                                event.target
                                                                    .value || null
                                                            )
                                                        }
                                                        className="h-9 max-w-[220px] rounded-lg border border-stroke-soft-200 px-2.5 text-label-xs outline-none focus:border-blue-500"
                                                    >
                                                        {agentOptions.map(
                                                            (agent) => (
                                                                <option
                                                                    key={
                                                                        agent.id ||
                                                                        "unassigned"
                                                                    }
                                                                    value={agent.id}
                                                                >
                                                                    {agent.label}
                                                                </option>
                                                            )
                                                        )}
                                                    </select>
                                                </td>
                                                <td className="px-5 py-4 text-sub-600">
                                                    {dateFormatter.format(
                                                        new Date(
                                                            ticket.createdAt.includes(
                                                                "T"
                                                            )
                                                                ? ticket.createdAt
                                                                : `${ticket.createdAt}T00:00:00`
                                                        )
                                                    )}
                                                </td>
                                                <td className="px-5 py-4">
                                                    {ticket.status ===
                                                    "resolved" ? (
                                                        <button
                                                            type="button"
                                                            className="text-label-sm text-blue-500 hover:text-blue-600"
                                                            onClick={() =>
                                                                void setTicketStatus(
                                                                    ticket.id,
                                                                    "open"
                                                                )
                                                            }
                                                        >
                                                            Reopen
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className="text-label-sm text-green-600 hover:text-green-700"
                                                            onClick={() =>
                                                                void setTicketStatus(
                                                                    ticket.id,
                                                                    "resolved"
                                                                )
                                                            }
                                                        >
                                                            Resolve
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                            {open ? (
                                                <tr className="bg-weak-50">
                                                    <td
                                                        colSpan={7}
                                                        className="px-5 py-4 text-label-sm text-sub-600"
                                                    >
                                                        <p className="text-label-xs font-medium uppercase tracking-wide text-sub-600">
                                                            Message
                                                        </p>
                                                        <p className="mt-2 whitespace-pre-wrap text-strong-950">
                                                            {ticket.message?.trim() ||
                                                                "No message provided."}
                                                        </p>
                                                    </td>
                                                </tr>
                                            ) : null}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {ticketsReady && filtered.length === 0 ? (
                        <div className="px-5 py-12 text-center">
                            <p className="text-label-sm text-strong-950">
                                No tickets found
                            </p>
                        </div>
                    ) : null}
                    <div className="border-t border-stroke-soft-200 px-5 py-3 text-label-xs text-sub-600">
                        Showing {filtered.length} of {tickets.length} tickets
                    </div>
                </section>
            </AdminTicketsTableSkeleton>
        </div>
    );
};

export default LiveTicketsPage;
