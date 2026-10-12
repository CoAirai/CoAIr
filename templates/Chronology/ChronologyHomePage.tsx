"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { useLiveWorkspace } from "@/context/LiveWorkspaceContext";
import { planForCompany } from "@/lib/admin/plans";
import { companyForSession, resolveLiveAddOns, liveModuleGrantsPending } from "@/lib/workspace/companyForSession";
import { buildChronologyReport } from "@/lib/chronology/generate";
import type { ChronologyReport } from "@/lib/chronology/types";
import { mapChronologyJob } from "@/lib/coair/mapChronology";
import { generateChronology, listReports, retryReport } from "@/lib/coair/reports";
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
    const live = useLiveWorkspace();
    const company = companyForSession(session, companies, {
        addOns: resolveLiveAddOns(
            live.enabled,
            live.moduleAddOns,
            session?.moduleGrants
        ),
    });
    const plan = planForCompany(company, plans);
    const grantsPending = liveModuleGrantsPending({
        liveEnabled: live.enabled,
        liveLoading: live.loading,
        moduleAddOns: live.moduleAddOns,
        sessionGrants: session?.moduleGrants,
    });
    const gate =
        company && plan && !grantsPending
            ? getModuleGate(plan, company, "chronology", {
                  features: session?.features,
                  role: session?.role,
              })
            : null;
    const ownerUserId = activeWorkspaceUserId ?? session?.userId ?? undefined;
    const mockReports = company
        ? ownedByUser(
              companyWorkspaces[company.id]?.chronologyReports ?? [],
              ownerUserId
          )
        : [];
    const [liveReports, setLiveReports] = useState<ChronologyReport[]>([]);
    const reports = live.enabled ? liveReports : mockReports;

    const [topic, setTopic] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [parties, setParties] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [retryingId, setRetryingId] = useState("");

    const documents = useMemo(
        () =>
            live.enabled
                ? live.documents
                : (companyWorkspaces[company?.id ?? ""]?.documents ?? []),
        [company?.id, companyWorkspaces, live.documents, live.enabled]
    );
    const indexingLeft = useMemo(
        () =>
            documents.filter((doc) => {
                const value = (doc.status || "completed").toLowerCase();
                return value !== "completed" && value !== "ready" && value !== "error";
            }).length,
        [documents]
    );

    useEffect(() => {
        if (!live.enabled || !session?.accessToken || !session.projectId) {
            setLiveReports([]);
            return;
        }
        let cancelled = false;
        let timer = 0;
        const load = () => {
            const token = session.accessToken;
            const projectId = session.projectId;
            if (!token || !projectId) return;
            void listReports(token, projectId, "chronology")
                .then((payload) => {
                    if (cancelled) return;
                    const mapped = (payload.reports ?? []).map((job) =>
                        mapChronologyJob(job, session.companyId ?? "live")
                    );
                    setLiveReports(mapped);
                    if (mapped.some((report) => report.status === "generating")) {
                        timer = window.setTimeout(load, 8000);
                    }
                })
                .catch((err) => {
                    if (!cancelled) {
                        setError(
                            err instanceof Error
                                ? err.message
                                : "Unable to load chronology reports"
                        );
                    }
                });
        };
        load();
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [live.enabled, session?.accessToken, session?.companyId, session?.projectId]);

    useEffect(() => {
        if (gate?.state === "locked") {
            router.replace("/workspace?upgrade=chronology");
        }
    }, [gate, router]);

    if (!company || !plan || !gate || gate.state === "locked") {
        return <ModulePortalSkeleton />;
    }

    const generate = async (event: FormEvent) => {
        event.preventDefault();
        if (!topic.trim()) {
            setError("Describe the issue to investigate.");
            return;
        }
        if (live.enabled) {
            if (!session?.accessToken || !session.projectId) {
                setError("Select a live project first.");
                return;
            }
            setSubmitting(true);
            setError("");
            try {
                const job = await generateChronology(
                    session.accessToken,
                    session.projectId,
                    {
                        topic: topic.trim(),
                        date_from: startDate,
                        date_to: endDate,
                        parties: parties
                            .split(",")
                            .map((part) => part.trim())
                            .filter(Boolean),
                    }
                );
                router.push(`/workspace/chronology/${job.job_id}`);
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Unable to start chronology"
                );
            } finally {
                setSubmitting(false);
            }
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
                                max={endDate || undefined}
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
                                min={startDate || undefined}
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
                            You can generate once the first documents are indexed.
                            {indexingLeft > 0
                                ? ` ${indexingLeft.toLocaleString()} files are still indexing, so this report is a first pass.`
                                : " Reviewing sources improves coverage."}
                            {gate.kind === "trial"
                                ? ` Trial remaining: ${gate.trialRemaining}.`
                                : ""}
                        </p>
                        <div className="flex gap-2">
                            <button
                                type="submit"
                                disabled={submitting || !topic.trim()}
                                className="h-11 rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 hover:bg-blue-600 disabled:opacity-60"
                            >
                                {submitting
                                    ? "Starting…"
                                    : "Generate chronology →"}
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
                        {reports.length === 0 ? (
                            <p className="py-6 text-label-sm text-sub-600">
                                No chronology reports yet.
                            </p>
                        ) : null}
                        {reports.map((report) => (
                            <div
                                key={report.id}
                                className="flex flex-col gap-1 py-3 text-label-sm md:grid md:grid-cols-[5rem_minmax(0,1fr)_7rem_auto] md:items-center md:gap-4"
                            >
                                <span className="text-sub-600">
                                    {report.reference}.x
                                </span>
                                <Link
                                    href={`/workspace/chronology/${report.id}`}
                                    className="truncate text-strong-950 hover:text-blue-500"
                                >
                                    {report.title}
                                </Link>
                                <span className="text-sub-600">
                                    {dateFormatter.format(new Date(report.createdAt))}
                                </span>
                                <span className="flex items-center justify-end gap-3">
                                    <span
                                        className={
                                            report.status === "ready"
                                                ? "text-green-600"
                                                : report.status === "generating"
                                                  ? "text-sub-600"
                                                  : "text-red-500"
                                        }
                                    >
                                        {report.status === "ready"
                                            ? "READY"
                                            : report.status === "generating"
                                              ? "RUNNING"
                                              : "FAILED"}
                                        {report.status === "failed" && report.error ? (
                                            <span className="mt-0.5 block max-w-40 truncate text-label-xs">
                                                {report.error.replaceAll("_", " ")}
                                            </span>
                                        ) : null}
                                    </span>
                                    {live.enabled && report.status === "failed" ? (
                                        <button
                                            type="button"
                                            disabled={retryingId === report.id}
                                            className="text-blue-500 hover:underline disabled:opacity-60"
                                            onClick={() => {
                                                if (
                                                    !session?.accessToken ||
                                                    !session.projectId
                                                ) {
                                                    return;
                                                }
                                                setRetryingId(report.id);
                                                setError("");
                                                void retryReport(
                                                    session.accessToken,
                                                    session.projectId,
                                                    report.id
                                                )
                                                    .then(() => {
                                                        router.push(
                                                            `/workspace/chronology/${report.id}`
                                                        );
                                                    })
                                                    .catch((err) => {
                                                        setError(
                                                            err instanceof Error
                                                                ? err.message
                                                                : "Unable to retry chronology"
                                                        );
                                                    })
                                                    .finally(() =>
                                                        setRetryingId("")
                                                    );
                                            }}
                                        >
                                            {retryingId === report.id
                                                ? "Retrying…"
                                                : "Retry"}
                                        </button>
                                    ) : null}
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
