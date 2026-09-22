"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Icon from "@/components/Icon";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import {
    fileKindLabel,
    getDocumentPreview,
    pageRef,
} from "@/lib/chat/citations";
import { chatSpring, chatTransition } from "@/lib/chat/motion";
import type { Citation } from "@/lib/chat/types";
import {
    fetchDocContent,
    type CoairDocContent,
} from "@/lib/coair/documents";

const PANEL_WIDTH = 352;

function highlightSnippet(text: string, highlight: string) {
    if (!highlight?.trim()) return text;
    const idx = text.toLowerCase().indexOf(highlight.toLowerCase().slice(0, 80));
    if (idx === -1) return text;
    const end = idx + Math.min(highlight.length, 120);
    return (
        <>
            {text.slice(0, idx)}
            <mark className="rounded bg-yellow-100 px-0.5 text-strong-950">
                {text.slice(idx, end)}
            </mark>
            {text.slice(end)}
        </>
    );
}

const DocumentPreview = () => {
    const { session } = useAuth();
    const { openCitation, closeDocumentPreview } = useChat();
    const lastCitation = useRef<Citation | null>(openCitation);
    if (openCitation) lastCitation.current = openCitation;
    const citation = openCitation ?? lastCitation.current;
    const open = Boolean(openCitation && citation);

    const isLive = Boolean(
        session?.source === "live" &&
            session.accessToken &&
            session.projectId &&
            citation
    );

    const mockPreview = citation
        ? getDocumentPreview(citation.documentId, citation.name)
        : null;

    const [page, setPage] = useState(citation?.page ?? 1);
    const [live, setLive] = useState<CoairDocContent | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (openCitation) setPage(openCitation.page);
    }, [openCitation]);

    useEffect(() => {
        if (!open || !citation || !isLive || !session?.accessToken || !session.projectId) {
            setLive(null);
            setError(null);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        void fetchDocContent(
            session.accessToken,
            session.projectId,
            citation.documentId,
            { anchor: `page_${page}`, fileName: citation.name }
        )
            .then((data) => {
                if (cancelled) return;
                if (data.error) {
                    setError(data.error);
                    setLive(null);
                    return;
                }
                setLive(data);
            })
            .catch((err) => {
                if (cancelled) return;
                setError(
                    err instanceof Error ? err.message : "Failed to load document"
                );
                setLive(null);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [
        open,
        isLive,
        citation?.documentId,
        citation?.name,
        page,
        session?.accessToken,
        session?.projectId,
    ]);

    const displayName =
        live?.file_name || citation?.name || mockPreview?.name || "Document";
    const pageCount = isLive
        ? live?.total_pages ?? Math.max(page, citation?.page ?? 1)
        : mockPreview?.pageCount ?? 1;
    const mockPage =
        mockPreview?.pages.find((entry) => entry.page === page) ??
        mockPreview?.pages[0];
    const extracted =
        (isLive ? live?.text : mockPage?.text) ||
        citation?.excerpt ||
        "";
    const kind = fileKindLabel(displayName);
    const hasImage =
        Boolean(live?.image_base64) &&
        /^[A-Za-z0-9+/=\s]+$/.test(live?.image_base64 || "");

    return (
        <motion.aside
            initial={false}
            animate={{
                width: open ? PANEL_WIDTH : 0,
                opacity: open ? 1 : 0,
            }}
            transition={chatSpring}
            className={`h-full shrink-0 overflow-hidden bg-white-0 max-md:z-10 ${
                open
                    ? "border-l border-stroke-soft-200 max-md:absolute max-md:inset-0 max-md:!w-full max-md:border-l-0 max-md:rounded-xl"
                    : "pointer-events-none max-md:hidden"
            }`}
        >
            <div className="flex h-full w-[22rem] flex-col max-md:w-full">
                <div className="flex items-center gap-2 border-b border-stroke-soft-200 px-4 py-3">
                    <span className="rounded-md bg-weak-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-sub-600">
                        {kind}
                    </span>
                    <div className="min-w-0 grow truncate text-label-sm text-strong-950">
                        {displayName}
                    </div>
                    <div className="flex shrink-0 items-center gap-1 text-label-xs text-sub-600">
                        <button
                            type="button"
                            className="rounded-lg px-1.5 py-1 hover:bg-weak-50 disabled:opacity-40"
                            disabled={page <= 1 || loading}
                            onClick={() =>
                                setPage((value) => Math.max(1, value - 1))
                            }
                        >
                            ‹
                        </button>
                        <span className="tabular-nums">
                            {page}/{pageCount}
                        </span>
                        <button
                            type="button"
                            className="rounded-lg px-1.5 py-1 hover:bg-weak-50 disabled:opacity-40"
                            disabled={page >= pageCount || loading}
                            onClick={() =>
                                setPage((value) =>
                                    Math.min(pageCount, value + 1)
                                )
                            }
                        >
                            ›
                        </button>
                    </div>
                    <button
                        type="button"
                        className="rounded-lg p-1 hover:bg-weak-50"
                        aria-label="Close document preview"
                        onClick={closeDocumentPreview}
                    >
                        <Icon className="fill-strong-950" name="close" />
                    </button>
                </div>

                <div className="px-4 pt-3">
                    <span className="inline-flex rounded-full bg-weak-50 px-2.5 py-1 text-label-xs text-sub-600">
                        {pageCount} {pageCount === 1 ? "page" : "pages"}
                    </span>
                </div>

                <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
                    <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-stroke-soft-200 bg-soft-200 p-3">
                        <div className="relative h-full overflow-auto rounded-sm bg-white-0 px-3 py-4 shadow-sm">
                            {!isLive && (
                                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[4rem] font-semibold tracking-[0.35em] text-soft-400/30 rotate-[-28deg]">
                                    DRAFT
                                </div>
                            )}
                            <motion.div
                                key={`${citation?.documentId ?? "doc"}-${page}-${isLive ? "live" : "mock"}`}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={chatTransition}
                                className="relative"
                            >
                                {loading && (
                                    <div className="py-8 text-center text-label-sm text-soft-400">
                                        Loading page {page}…
                                    </div>
                                )}
                                {!loading && error && (
                                    <div className="py-6 text-label-sm text-red-500">
                                        {error}
                                    </div>
                                )}
                                {!loading && !error && hasImage && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={`data:image/png;base64,${live!.image_base64}`}
                                        alt={`Page ${page} of ${displayName}`}
                                        className="w-full rounded"
                                    />
                                )}
                                {!loading &&
                                    !error &&
                                    !hasImage &&
                                    isLive &&
                                    live?.type === "table" && (
                                        <div className="overflow-auto text-label-xs">
                                            <div className="mb-2 text-label-sm font-medium text-strong-950">
                                                {live.sheet_name || displayName}
                                            </div>
                                            <table className="w-full border-collapse">
                                                <thead>
                                                    <tr>
                                                        {(live.columns || []).map(
                                                            (col) => (
                                                                <th
                                                                    key={col}
                                                                    className="border-b border-stroke-soft-200 px-1 py-1 text-left"
                                                                >
                                                                    {col}
                                                                </th>
                                                            )
                                                        )}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(live.rows || [])
                                                        .slice(0, 40)
                                                        .map((row, i) => (
                                                            <tr key={i}>
                                                                {(
                                                                    live.columns ||
                                                                    Object.keys(row)
                                                                ).map((col) => (
                                                                    <td
                                                                        key={col}
                                                                        className="border-b border-stroke-soft-200 px-1 py-1 text-sub-600"
                                                                    >
                                                                        {String(
                                                                            row[col] ??
                                                                                ""
                                                                        )}
                                                                    </td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                {!loading &&
                                    !error &&
                                    !hasImage &&
                                    !(isLive && live?.type === "table") && (
                                        <>
                                            <div className="text-[11px] uppercase tracking-[0.18em] text-soft-400">
                                                Page {page}
                                            </div>
                                            {!isLive && mockPage?.heading && (
                                                <div className="mt-4 text-label-md font-semibold text-strong-950">
                                                    {mockPage.heading}
                                                </div>
                                            )}
                                            <p className="mt-3 whitespace-pre-wrap text-p-sm leading-6 text-strong-950">
                                                {extracted
                                                    ? highlightSnippet(
                                                          extracted,
                                                          citation?.excerpt || ""
                                                      )
                                                    : "No text available for this page."}
                                            </p>
                                        </>
                                    )}
                                <div className="mt-6 flex items-end justify-between text-[10px] text-soft-400">
                                    <span>
                                        {isLive
                                            ? "COAir document"
                                            : "COAir preview"}
                                    </span>
                                    <span className="tabular-nums">
                                        {pageRef(displayName, page)}
                                    </span>
                                </div>
                            </motion.div>
                        </div>
                    </div>

                    <div className="mt-3 shrink-0 border-t border-stroke-soft-200 pt-3">
                        <div className="mb-2 text-label-xs uppercase tracking-[0.16em] text-soft-400">
                            Extracted text
                        </div>
                        <motion.div
                            key={`extract-${citation?.documentId ?? "doc"}-${page}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={chatTransition}
                            className="max-h-40 overflow-auto pr-1 text-label-sm leading-6 text-strong-950"
                        >
                            <div className="text-label-xs text-soft-400">
                                Page {page}
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-sub-600">
                                {loading
                                    ? "Loading…"
                                    : extracted ||
                                      citation?.excerpt ||
                                      "No extracted text."}
                            </p>
                        </motion.div>
                    </div>
                </div>
            </div>
        </motion.aside>
    );
};

export default DocumentPreview;
