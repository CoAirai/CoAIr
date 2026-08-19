"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import PageHeader from "@/components/Admin/PageHeader";
import { useAuth } from "@/context/AuthContext";
import { apiErrorMessage, createTicket, listTickets } from "@/lib/coair/commerce";
import type { CompanyTicket, CompanyTicketPriority } from "@/lib/company/types";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
});

const PRIORITY_OPTIONS: CompanyTicketPriority[] = ["low", "medium", "high"];

const PRIORITY_CLASSES: Record<CompanyTicketPriority, string> = {
    low: "bg-weak-50 text-sub-600",
    medium: "bg-orange-500/10 text-orange-600",
    high: "bg-red-500/10 text-red-600",
};

const STATUS_CLASSES: Record<string, string> = {
    open: "bg-blue-500/10 text-blue-500",
    resolved: "bg-green-500/10 text-green-600",
};

const capitalize = (value: string) =>
    value.charAt(0).toUpperCase() + value.slice(1);

const LiveTicketsPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const [tickets, setTickets] = useState<CompanyTicket[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [subject, setSubject] = useState("");
    const [priority, setPriority] = useState<CompanyTicketPriority>("medium");
    const [message, setMessage] = useState("");
    const [formError, setFormError] = useState<string | null>(null);
    const [formSuccess, setFormSuccess] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const rows = await listTickets(token);
            setTickets(
                rows.map((ticket) => ({
                    id: ticket.id,
                    companyId: ticket.companyId,
                    subject: ticket.subject,
                    message: ticket.message ?? "",
                    priority: ticket.priority,
                    status: ticket.status,
                    createdAt: ticket.createdAt,
                }))
            );
            setError(null);
        } catch (err) {
            setError(apiErrorMessage(err));
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const canSubmit = subject.trim().length > 0 && message.trim().length > 0;

    const onSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!canSubmit) {
            setFormError("Subject and message are required");
            setFormSuccess(null);
            return;
        }
        try {
            await createTicket(token, {
                subject: subject.trim(),
                priority,
                message: message.trim(),
            });
            setFormError(null);
            setFormSuccess("Ticket created");
            setSubject("");
            setPriority("medium");
            setMessage("");
            await refresh();
        } catch (err) {
            setFormSuccess(null);
            setFormError(apiErrorMessage(err));
        }
    };

    return (
        <div className="page-stack">
            <PageHeader
                title="Tickets"
                description="Open a support ticket and track its status."
                action={
                    <button
                        type="button"
                        onClick={() => {
                            setShowForm((value) => !value);
                            setFormError(null);
                            setFormSuccess(null);
                        }}
                        className="h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0 hover:opacity-90"
                    >
                        {showForm ? "Close form" : "New ticket"}
                    </button>
                }
            />
            {error ? <p className="text-label-sm text-red-500">{error}</p> : null}
            {showForm ? (
                <form onSubmit={onSubmit} className="surface-panel p-5">
                    <h2 className="text-label-lg text-strong-950">New ticket</h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Our team will get back to you as soon as possible.
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,2fr)_140px]">
                        <label className="block">
                            <span className="mb-1.5 block text-label-xs text-sub-600">
                                Subject
                            </span>
                            <input
                                required
                                type="text"
                                value={subject}
                                onChange={(event) => setSubject(event.target.value)}
                                placeholder="What do you need help with?"
                                className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none placeholder:text-sub-600 focus:border-blue-500"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1.5 block text-label-xs text-sub-600">
                                Priority
                            </span>
                            <select
                                value={priority}
                                onChange={(event) =>
                                    setPriority(
                                        event.target.value as CompanyTicketPriority
                                    )
                                }
                                className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                            >
                                {PRIORITY_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                        {capitalize(option)}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <label className="mt-3 block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Message
                        </span>
                        <textarea
                            required
                            rows={4}
                            value={message}
                            onChange={(event) => setMessage(event.target.value)}
                            placeholder="Describe the issue or request"
                            className="w-full resize-none rounded-xl border border-stroke-soft-200 px-3 py-2 text-label-sm outline-none placeholder:text-sub-600 focus:border-blue-500"
                        />
                    </label>
                    {formError ? (
                        <p className="mt-3 text-label-sm text-red-500">{formError}</p>
                    ) : null}
                    {formSuccess ? (
                        <p className="mt-3 text-label-sm text-green-600">
                            {formSuccess}
                        </p>
                    ) : null}
                    <button
                        type="submit"
                        disabled={!canSubmit}
                        className="mt-4 h-10 rounded-full bg-blue-500 px-4 text-label-sm text-white-0 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Submit ticket
                    </button>
                </form>
            ) : null}

            <section className="surface-panel">
                <div className="border-b border-stroke-soft-200 p-5">
                    <h2 className="text-label-lg text-strong-950">Your tickets</h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        {loading
                            ? "Loading…"
                            : `${tickets.length} ticket${tickets.length === 1 ? "" : "s"}`}
                    </p>
                </div>
                {tickets.length === 0 ? (
                    <p className="px-5 py-12 text-center text-label-sm text-sub-600">
                        No tickets yet. Open one if you need help.
                    </p>
                ) : (
                    <div className="divide-y divide-stroke-soft-200">
                        {tickets.map((ticket) => (
                            <div key={ticket.id} className="p-5">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-label-sm text-strong-950">
                                            {ticket.subject}
                                        </p>
                                        <p className="mt-1 text-label-xs text-sub-600">
                                            Opened{" "}
                                            {dateFormatter.format(
                                                new Date(`${ticket.createdAt}T00:00:00`)
                                            )}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <span
                                            className={`inline-flex h-6 items-center rounded-full px-2.5 text-label-xs ${PRIORITY_CLASSES[ticket.priority]}`}
                                        >
                                            {capitalize(ticket.priority)}
                                        </span>
                                        <span
                                            className={`inline-flex h-6 items-center rounded-full px-2.5 text-label-xs ${STATUS_CLASSES[ticket.status] ?? "bg-weak-50 text-sub-600"}`}
                                        >
                                            {capitalize(ticket.status)}
                                        </span>
                                    </div>
                                </div>
                                <p className="mt-3 text-label-sm text-sub-600">
                                    {ticket.message}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

export default LiveTicketsPage;
