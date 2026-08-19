"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SourcePdfPreview from "@/components/SourcePdfPreview";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { companyForSession } from "@/lib/workspace/companyForSession";
import type { ChronologyCitation, ChronologyReport } from "@/lib/chronology/types";
import { mapChronologyJob } from "@/lib/coair/mapChronology";
import { downloadReportDocument, getReport } from "@/lib/coair/reports";
import ChronologyShell from "./ChronologyShell";

type Props = {
    reportId: string;
};

const ChronologyReportPage = ({ reportId }: Props) => {
    const { session } = useAuth();
    const { companies, companyWorkspaces } = useAdminData();
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
    const [openSource, setOpenSource] = useState<ChronologyCitation | null>(
        null
    );

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
    }, [live, reportId, session?.accessToken, session?.companyId, session?.projectId]);

    const createdLabel = useMemo(() => {
        if (!report) return "";
        return new Date(report.createdAt).toLocaleString("en-GB", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    }, [report]);

    const downloadWord = async () => {
        if (!live || !session?.accessToken || !session.projectId) return;
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
    };

    if (live && !report && !liveError) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-weak-50 text-sub-600">
                Loading report…
            </div>
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
                    onClick={() => setOpenSource(citation)}
                >
                    [{citation.srcId}]
                </button>
            );
        });
    };

    return (
        <ChronologyShell>
            <div className="chat-wrapper relative">
            <div className="flex min-h-0 flex-1 overflow-hidden">
                <main className="min-w-0 flex-1 overflow-auto bg-weak-50/40 px-8 py-8 scrollbar-none max-md:px-4">
                    <Link
                        href="/workspace/chronology"
                        className="text-label-xs uppercase tracking-[0.18em] text-soft-400 hover:text-strong-950"
                    >
                        Chronology
                    </Link>
                    <div className="mt-4 rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <p className="text-label-xs uppercase tracking-[0.18em] text-soft-400">
                                    {report.reference}
                                </p>
                                <h1 className="mt-2 max-w-3xl text-3xl font-medium text-strong-950">
                                    {report.title}
                                </h1>
                                <p className="mt-2 text-label-xs text-sub-600">
                                    Created {createdLabel} —{" "}
                                    {report.status === "generating"
                                        ? "generating"
                                        : "read-only record"}
                                </p>
                            </div>
                            {live && report.status === "ready" ? (
                                <button
                                    type="button"
                                    onClick={() => void downloadWord()}
                                    className="h-10 rounded-xl border border-stroke-soft-200 px-4 text-label-sm text-strong-950 hover:bg-weak-50"
                                >
                                    Download Word ↓
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="h-10 rounded-xl border border-stroke-soft-200 px-4 text-label-sm text-strong-950 hover:bg-weak-50"
                                >
                                    Download Word ↓
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="mt-8 grid gap-3">
                        {report.sections.map((section) => (
                            <section
                                key={section.id}
                                className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5"
                            >
                                <h2 className="text-label-md text-strong-950">
                                    {section.heading}
                                </h2>
                                <p className="mt-3 text-label-sm leading-7 text-sub-600">
                                    {renderBody(section.body, section.citations)}
                                </p>
                            </section>
                        ))}
                    </div>
                </main>

                {!openSource ? (
                    <aside className="w-80 shrink-0 border-l border-stroke-soft-200 bg-weak-50/60 p-5">
                        <h2 className="text-label-xs uppercase tracking-[0.18em] text-soft-400">
                            Verified sources · {report.sources.length}
                        </h2>
                        <div className="mt-4 space-y-3">
                            {report.sources.map((source) => (
                                <button
                                    key={source.id}
                                    type="button"
                                    onClick={() => setOpenSource(source)}
                                    className="block w-full rounded-xl border border-stroke-soft-200 bg-white-0 p-3 text-left hover:border-stroke-sub-300"
                                >
                                    <div className="truncate text-label-sm text-strong-950">
                                        {source.name}
                                    </div>
                                    <div className="mt-1 truncate text-label-xs text-sub-600">
                                        {source.srcId}
                                    </div>
                                    <div className="mt-1 text-label-xs text-sub-600">
                                        p.{source.page}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </aside>
                ) : null}

                <SourcePdfPreview
                    open={Boolean(openSource)}
                    documentId={openSource?.documentId}
                    name={openSource?.name}
                    page={openSource?.page}
                    onClose={() => setOpenSource(null)}
                />
            </div>
            </div>
        </ChronologyShell>
    );
};

export default ChronologyReportPage;
