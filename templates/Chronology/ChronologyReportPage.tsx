"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DocumentPreview from "@/components/Chat/DocumentPreview";
import { ChronologyReportSkeleton } from "@/components/Skeleton/sections";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import { companyForSession } from "@/lib/workspace/companyForSession";
import type { ChronologyEvent, ChronologyEventSource } from "@/lib/chronology/events";
import type { ChronologyCitation, ChronologyReport } from "@/lib/chronology/types";
import { mapChronologyJob } from "@/lib/coair/mapChronology";
import {
    downloadReportDocument,
    getReport,
    retryReport,
    setChronologyReview,
} from "@/lib/coair/reports";
import ChronologyShell from "./ChronologyShell";
import EventTable, { type EventFilter } from "./Report/EventTable";
import ReportHeader from "./Report/ReportHeader";
import ReviewBar from "./Report/ReviewBar";
import SourceChip from "./Report/SourceChip";
import Timeline from "./Report/Timeline";

type Props = {
    reportId: string;
};

const ChronologyReportPage = ({ reportId }: Props) => {
    const { session } = useAuth();
    const { companies, companyWorkspaces } = useAdminData();
    const { openCitation, openDocumentPreview, closeDocumentPreview } = useChat();
    const company = companyForSession(session, companies);
    const live = session?.source === "live";
    const mockReport = company
        ? companyWorkspaces[company.id]?.chronologyReports.find(
              (entry) => entry.id === reportId
          )
        : null;
    const [liveReport, setLiveReport] = useState<ChronologyReport | null>(null);
    const [liveError, setLiveError] = useState<string | null>(null);
    const report = live ? liveReport : mockReport;
    const [retrying, setRetrying] = useState(false);
    const [pollEpoch, setPollEpoch] = useState(0);
    const [downloading, setDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState("");
    const [selected, setSelected] = useState<{ ref: string; srcId: string } | null>(null);
    const [filter, setFilter] = useState<EventFilter>("all");
    const [savingRefs, setSavingRefs] = useState<string[]>([]);
    const [reviewError, setReviewError] = useState("");

    useEffect(() => () => closeDocumentPreview(), [closeDocumentPreview]);

    useEffect(() => {
        if (!openCitation) setSelected(null);
    }, [openCitation]);

    useEffect(() => {
        if (!live || !session?.accessToken || !session.projectId) return;
        let cancelled = false;
        let timer: number | undefined;
        const token = session.accessToken;
        const projectId = session.projectId;
        const companyId = session.companyId ?? "live";

        const tick = async () => {
            try {
                const job = await getReport(token, projectId, reportId);
                if (cancelled) return;
                setLiveReport(mapChronologyJob(job, companyId));
                setLiveError(null);
                if (
                    job.status !== "ready" &&
                    job.status !== "failed" &&
                    job.status !== "credit_balance_exhausted"
                ) {
                    timer = window.setTimeout(() => {
                        void tick();
                    }, 2500);
                }
            } catch (err) {
                if (!cancelled) {
                    setLiveError(
                        err instanceof Error ? err.message : "Report not found"
                    );
                }
            }
        };
        void tick();
        return () => {
            cancelled = true;
            if (timer) window.clearTimeout(timer);
        };
    }, [
        live,
        pollEpoch,
        reportId,
        session?.accessToken,
        session?.companyId,
        session?.projectId,
    ]);

    const events = useMemo(() => report?.events ?? [], [report]);

    const openSource = useCallback(
        (event: ChronologyEvent | null, source: ChronologyEventSource | ChronologyCitation) => {
            const srcId = source.srcId;
            setSelected(event ? { ref: event.ref, srcId } : null);
            openDocumentPreview({
                documentId: source.documentId,
                name: source.name,
                page: source.page,
                excerpt: "excerpt" in source ? source.excerpt : "",
            });
        },
        [openDocumentPreview]
    );

    const toggleReview = async (event: ChronologyEvent) => {
        if (!live || !session?.accessToken || !session.projectId || !report) return;
        const next = !event.reviewed;
        const patch = (reviewed: boolean) =>
            setLiveReport((current) =>
                current
                    ? {
                          ...current,
                          events: (current.events ?? []).map((entry) =>
                              entry.ref === event.ref ? { ...entry, reviewed } : entry
                          ),
                      }
                    : current
            );
        patch(next);
        setReviewError("");
        setSavingRefs((refs) => [...refs, event.ref]);
        try {
            const job = await setChronologyReview(
                session.accessToken,
                session.projectId,
                reportId,
                [event.ref],
                next
            );
            setLiveReport(mapChronologyJob(job, session.companyId ?? "live"));
        } catch (err) {
            patch(event.reviewed);
            setReviewError(
                err instanceof Error ? err.message : "Could not save the review."
            );
        } finally {
            setSavingRefs((refs) => refs.filter((ref) => ref !== event.ref));
        }
    };

    const reviewNext = () => {
        const next = events.find((event) => !event.reviewed);
        if (!next) return;
        setFilter("all");
        window.requestAnimationFrame(() => {
            document
                .getElementById(`chronology-row-${next.ref}`)
                ?.scrollIntoView({ block: "center", behavior: "smooth" });
        });
        if (next.sources[0]) openSource(next, next.sources[0]);
    };

    const downloadWord = async () => {
        if (!live || !session?.accessToken || !session.projectId || downloading) return;
        setDownloading(true);
        setDownloadError("");
        try {
            const blob = await downloadReportDocument(
                session.accessToken,
                session.projectId,
                reportId
            );
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `${report?.title || "chronology"}.docx`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            setDownloadError(
                err instanceof Error ? err.message : "Could not prepare the Word file."
            );
        } finally {
            setDownloading(false);
        }
    };

    const retry = () => {
        if (!session?.accessToken || !session.projectId) return;
        setRetrying(true);
        setLiveError(null);
        void retryReport(session.accessToken, session.projectId, reportId)
            .then((job) => {
                setLiveReport(mapChronologyJob(job, session.companyId ?? "live"));
                setPollEpoch((value) => value + 1);
            })
            .catch((err) => {
                setLiveError(
                    err instanceof Error ? err.message : "Unable to retry chronology"
                );
            })
            .finally(() => setRetrying(false));
    };

    if (live && !report && !liveError) {
        return (
            <ChronologyReportSkeleton loading>
                <div />
            </ChronologyReportSkeleton>
        );
    }

    if (!company || !report) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-weak-50 text-sub-600">
                {liveError || "Report not found."}{" "}
                <Link className="ml-2 text-blue-500" href="/workspace/chronology">
                    Back
                </Link>
            </div>
        );
    }

    const renderBody = (body: string, citations: ChronologyCitation[]) => {
        const parts = body.split(/(\[[^\]]+\])/g);
        return parts.map((part, index) => {
            const match = part.match(/^\[([^\]]+)\]$/);
            if (!match) return <span key={index}>{part}</span>;
            const citation =
                citations.find((entry) => entry.srcId === match[1]) ??
                report.sources.find((entry) => entry.srcId === match[1]);
            if (!citation) return <span key={index}>{part}</span>;
            return (
                <button
                    key={index}
                    type="button"
                    className="text-blue-500 hover:underline"
                    onClick={() => openSource(null, citation)}
                >
                    {citation.name}, p.{citation.page}
                </button>
            );
        });
    };

    const hasEvents = report.status === "ready" && events.length > 0;
    const notices = [liveError, downloadError, reviewError].filter(Boolean);

    return (
        <ChronologyShell>
            <div className="chat-wrapper relative">
                <div className="flex min-h-0 flex-1 overflow-hidden">
                    <main className="min-w-0 flex-1 overflow-auto bg-weak-50/40 px-8 pb-6 pt-8 scrollbar-none max-md:px-4">
                        <div className="mx-auto grid max-w-[1180px] gap-4">
                            <Link
                                href="/workspace/chronology"
                                className="text-label-xs uppercase tracking-[0.18em] text-soft-400 hover:text-strong-950"
                            >
                                ← All chronologies
                            </Link>

                            {notices.map((notice) => (
                                <p key={notice} role="alert" className="text-label-sm text-red-500">
                                    {notice}
                                </p>
                            ))}

                            {hasEvents ? (
                                <>
                                    {report.coveragePartial ? (
                                        <div className="rounded-2xl border border-[#F6D89A] bg-[#FFF6E6] px-4 py-3 text-label-sm text-[#8A5200]">
                                            This chronology was built from part of the matching records, so some
                                            events may be missing. Check the record before relying on it.
                                        </div>
                                    ) : null}
                                    <ReportHeader
                                        report={report}
                                        events={events}
                                        downloading={downloading}
                                        onDownloadWord={live ? () => void downloadWord() : undefined}
                                    />
                                    {report.overview && report.overview.length > 0 ? (
                                        <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                                            <h2 className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-soft-400">
                                                Overview
                                            </h2>
                                            <ul className="mt-3 grid gap-3">
                                                {report.overview.map((claim, index) => (
                                                    <li key={index} className="text-label-sm leading-6 text-sub-600">
                                                        {claim.text}
                                                        <span className="ml-2 inline-flex flex-wrap gap-1.5 align-middle">
                                                            {claim.sources.map((source) => (
                                                                <SourceChip
                                                                    key={source.srcId}
                                                                    source={source}
                                                                    onOpen={(chosen) => openSource(null, chosen)}
                                                                />
                                                            ))}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </section>
                                    ) : null}
                                    <Timeline
                                        events={events}
                                        selectedRef={selected?.ref ?? null}
                                        onSelect={(event) =>
                                            event.sources[0] && openSource(event, event.sources[0])
                                        }
                                    />
                                    <EventTable
                                        events={events}
                                        filter={filter}
                                        onFilter={setFilter}
                                        selectedRef={selected?.ref ?? null}
                                        activeSourceId={selected?.srcId ?? null}
                                        savingRefs={savingRefs}
                                        canReview={live}
                                        onOpenSource={openSource}
                                        onToggleReview={(event) => void toggleReview(event)}
                                    />
                                    {live ? <ReviewBar events={events} onReviewNext={reviewNext} /> : null}
                                </>
                            ) : (
                                <>
                                    <div className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                                        <p className="text-label-xs uppercase tracking-[0.18em] text-soft-400">
                                            Chronology {report.reference}
                                        </p>
                                        <h1 className="mt-2 max-w-3xl text-3xl font-medium text-strong-950">
                                            {report.title}
                                        </h1>
                                        <p className="mt-2 text-label-xs text-sub-600">
                                            {report.status === "generating"
                                                ? "Generating. You can close this page; the chronology continues on the server."
                                                : report.status === "failed"
                                                  ? "Failed. Retry to run it again."
                                                  : "Read-only record"}
                                        </p>
                                        {live && report.status === "failed" ? (
                                            <button
                                                type="button"
                                                disabled={retrying}
                                                onClick={retry}
                                                className="mt-3 h-10 rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 hover:bg-blue-600 disabled:opacity-60"
                                            >
                                                {retrying ? "Retrying…" : "Retry"}
                                            </button>
                                        ) : null}
                                    </div>
                                    {report.sections.map((section) => (
                                        <section
                                            key={section.id}
                                            className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5"
                                        >
                                            <h2 className="text-label-md text-strong-950">{section.heading}</h2>
                                            <p className="mt-3 text-label-sm leading-7 text-sub-600">
                                                {renderBody(section.body, section.citations)}
                                            </p>
                                        </section>
                                    ))}
                                </>
                            )}
                        </div>
                    </main>
                    <DocumentPreview />
                </div>
            </div>
        </ChronologyShell>
    );
};

export default ChronologyReportPage;
