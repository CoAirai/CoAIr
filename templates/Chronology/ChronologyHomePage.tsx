"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { getPlanById } from "@/lib/admin/plans";
import { buildChronologyReport } from "@/lib/chronology/generate";
import { getModuleGate } from "@/lib/workspace/moduleAccess";
import { ownedByUser } from "@/lib/workspace/ownedByUser";
import { useChat } from "@/context/ChatContext";
import ChronologyShell from "./ChronologyShell";
import { ModulePortalSkeleton } from "@/components/Skeleton/portals";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
});

const ChronologyHomePage = () => {
    const router = useRouter();
    const { session } = useAuth();
    const {
        companies,
        plans,
        companyWorkspaces,
        incrementTrialUsage,
        addChronologyReport,
    } = useAdminData();
    const { activeWorkspaceUserId } = useChat();
    const company = companies.find((entry) => entry.id === session?.companyId);
    const plan = company ? getPlanById(company.planId, plans) : null;
    const gate =
        company && plan ? getModuleGate(plan, company, "chronology") : null;
    const ownerUserId = activeWorkspaceUserId ?? session?.userId ?? undefined;
    const reports = company
        ? ownedByUser(
              companyWorkspaces[company.id]?.chronologyReports ?? [],
              ownerUserId
          )
        : [];

    const [topic, setTopic] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [parties, setParties] = useState("");
    const [error, setError] = useState("");

    const documents = useMemo(
        () => companyWorkspaces[company?.id ?? ""]?.documents ?? [],
        [companyWorkspaces, company?.id]
    );

    useEffect(() => {
        if (gate?.state === "locked") {
            router.replace("/workspace?upgrade=chronology");
        }
    }, [gate, router]);

    if (!company || !plan || !gate || gate.state === "locked") {
        return <ModulePortalSkeleton />;
    }

    const generate = (event: FormEvent) => {
        event.preventDefault();
        if (!topic.trim()) {
            setError("Describe the issue to investigate.");
            return;
        }
        const nextIndex =
            reports.reduce((max, report) => {
                const value = Number(report.reference.split(".")[1] ?? 0);
                return Number.isFinite(value) ? Math.max(max, value) : max;
            }, 20) + 1;
        const report = buildChronologyReport({
            topic,
            startDate,
            endDate,
            parties,
            nextIndex,
            now: new Date(),
            companyId: company.id,
            ownerUserId,
            documents: documents.map((doc) => ({ id: doc.id, name: doc.name })),
        });
        addChronologyReport(report);
        if (gate.kind === "trial") {
            incrementTrialUsage(company.id, "chronology");
        }
        router.push(`/workspace/chronology/${report.id}`);
    };

    return (
        <ChronologyShell>
            <div className="chat-wrapper">
            <main className="min-h-0 flex-1 overflow-auto px-7.5 py-8 scrollbar-none max-md:px-4 max-md:py-5">
                <p className="text-[11px] uppercase tracking-[0.22em] text-soft-400">
                    Module · Chronology
                </p>
                <h1 className="mt-3 text-4xl font-medium tracking-tight text-strong-950 max-md:text-3xl">
                    Build a new chronology
                </h1>
                <p className="mt-3 max-w-3xl text-label-sm leading-6 text-sub-600">
                    Research any issue across {company.name}. Every request
                    creates a permanent, English Word report with verified
                    project sources.
                </p>

                    <form
                    onSubmit={generate}
                    className="mt-8 rounded-2xl border border-stroke-soft-200 bg-weak-50 p-5"
                >
                    <label className="block">
                        <span className="mb-2 block text-label-xs uppercase tracking-[0.16em] text-soft-400">
                            Topic or research question
                        </span>
                        <textarea
                            value={topic}
                            onChange={(event) => setTopic(event.target.value)}
                            rows={4}
                            placeholder="Describe the issue, event or subject to investigate..."
                            className="w-full rounded-xl border border-stroke-soft-200 bg-white-0 px-4 py-3 text-label-sm text-strong-950 outline-none placeholder:text-soft-400 focus:border-blue-500"
                        />
                    </label>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <label className="block">
                            <span className="mb-2 block text-label-xs text-sub-600">
                                Start date (optional)
                            </span>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(event) =>
                                    setStartDate(event.target.value)
                                }
                                className="h-11 w-full rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-label-sm text-strong-950 outline-none focus:border-blue-500"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-2 block text-label-xs text-sub-600">
                                End date (optional)
                            </span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(event) => setEndDate(event.target.value)}
                                className="h-11 w-full rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-label-sm text-strong-950 outline-none focus:border-blue-500"
                            />
                        </label>
                    </div>
                    <label className="mt-4 block">
                        <span className="mb-2 block text-label-xs text-sub-600">
                            Parties (optional, comma-separated)
                        </span>
                        <input
                            value={parties}
                            onChange={(event) => setParties(event.target.value)}
                            placeholder="Employer, Contractor, Engineer"
                            className="h-11 w-full rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-label-sm text-strong-950 outline-none placeholder:text-soft-400 focus:border-blue-500"
                        />
                    </label>
                    {error ? (
                        <p className="mt-3 text-label-sm text-red-500">{error}</p>
                    ) : null}
                    <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
                        <p className="text-label-xs text-sub-600">
                            Reviewing sources improves coverage. You may also
                            generate automatically.
                            {gate.kind === "trial"
                                ? ` Trial remaining: ${gate.trialRemaining}.`
                                : ""}
                        </p>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                className="h-11 rounded-xl border border-stroke-soft-200 px-4 text-label-sm text-sub-600 hover:bg-weak-50"
                            >
                                Find source documents
                            </button>
                            <button
                                type="submit"
                                className="h-11 rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 hover:bg-blue-600"
                            >
                                Generate chronology →
                            </button>
                        </div>
                    </div>
                </form>

                <section className="mt-12">
                    <div className="flex items-end justify-between">
                        <h2 className="text-label-lg text-strong-950">
                            Project chronology reports
                        </h2>
                        <span className="text-label-xs text-sub-600">
                            {reports.length} total
                        </span>
                    </div>
                    <div className="mt-4 divide-y divide-stroke-soft-200 border-t border-stroke-soft-200">
                        {reports.map((report) => (
                            <div
                                key={report.id}
                                className="grid grid-cols-[5rem_minmax(0,1fr)_7rem_5rem] items-center gap-4 py-3 text-label-sm"
                            >
                                <span className="text-sub-600">
                                    {report.reference}.x
                                </span>
                                {report.status === "ready" ? (
                                    <Link
                                        href={`/workspace/chronology/${report.id}`}
                                        className="truncate text-strong-950 hover:text-blue-500"
                                    >
                                        {report.title}
                                    </Link>
                                ) : (
                                    <span className="truncate text-sub-600">
                                        {report.title}
                                    </span>
                                )}
                                <span className="text-sub-600">
                                    {dateFormatter.format(new Date(report.createdAt))}
                                </span>
                                <span
                                    className={
                                        report.status === "ready"
                                            ? "text-green-600"
                                            : "text-red-500"
                                    }
                                >
                                    {report.status === "ready" ? "READY" : "FAILED"}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            </main>
            </div>
        </ChronologyShell>
    );
};

export default ChronologyHomePage;
