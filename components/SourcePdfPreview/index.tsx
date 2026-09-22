"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Icon from "@/components/Icon";
import { useAuth } from "@/context/AuthContext";
import {
    fileKindLabel,
    getDocumentPreview,
    pageRef,
} from "@/lib/chat/citations";
import { chatSpring, chatTransition } from "@/lib/chat/motion";
import {
    fetchDocContent,
    type CoairDocContent,
} from "@/lib/coair/documents";

type Props = {
    open: boolean;
    documentId?: string;
    name?: string;
    page?: number;
    onClose: () => void;
};

const SourcePdfPreview = ({
    open,
    documentId,
    name,
    page: initialPage = 1,
    onClose,
}: Props) => {
    const { session } = useAuth();
    const mockPreview =
        documentId && name ? getDocumentPreview(documentId, name) : null;
    const [page, setPage] = useState(initialPage);
    const [live, setLive] = useState<CoairDocContent | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isLive = Boolean(
        session?.source === "live" &&
            session.accessToken &&
            session.projectId &&
            documentId
    );

    useEffect(() => {
        if (open) setPage(initialPage);
    }, [open, documentId, initialPage]);

    useEffect(() => {
        if (
            !open ||
            !documentId ||
            !isLive ||
            !session?.accessToken ||
            !session.projectId
        ) {
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
            documentId,
            { anchor: `page_${page}`, fileName: name }
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
        documentId,
        name,
        page,
        session?.accessToken,
        session?.projectId,
    ]);

    const displayName = live?.file_name || name || mockPreview?.name || "Document";
    const pageCount = isLive
        ? live?.total_pages ?? Math.max(page, 1)
        : mockPreview?.pageCount ?? 1;
    const mockPage =
        mockPreview?.pages.find((entry) => entry.page === page) ??
        mockPreview?.pages[0];
    const extracted = (isLive ? live?.text : mockPage?.text) || "";
    const kind = fileKindLabel(displayName);
    const hasImage =
        Boolean(live?.image_base64) &&
        /^[A-Za-z0-9+/=\s]+$/.test(live?.image_base64 || "");

    return (
        <motion.aside
            initial={false}
            animate={{ width: open ? 360 : 0, opacity: open ? 1 : 0 }}
            transition={chatSpring}
            className={`h-full shrink-0 overflow-hidden ${
                open ? "" : "pointer-events-none"
            }`}
        >
            <div className="flex h-full w-[22.5rem] flex-col border-l border-stroke-soft-200 bg-white-0">
                <div className="flex items-center gap-2 border-b border-stroke-soft-200 px-4 py-3">
                    <span className="rounded-md bg-weak-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-sub-600">
                        {kind}
                    </span>
                    <div className="min-w-0 grow truncate text-label-sm text-strong-950">
                        {displayName}
                    </div>
                    <button
                        type="button"
                        className="rounded-lg p-1 hover:bg-weak-50"
                        aria-label="Close PDF preview"
                        onClick={onClose}
                    >
                        <Icon className="fill-strong-950" name="close" />
                    </button>
                </div>

                <div className="flex items-center justify-between px-4 pt-3 text-label-xs text-sub-600">
                    <span>
                        {pageCount} {pageCount === 1 ? "page" : "pages"}
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            disabled={page <= 1 || loading}
                            className="px-1.5 disabled:opacity-40"
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
                            disabled={page >= pageCount || loading}
                            className="px-1.5 disabled:opacity-40"
                            onClick={() =>
                                setPage((value) =>
                                    Math.min(pageCount, value + 1)
                                )
                            }
                        >
                            ›
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto p-4">
                    <div className="relative min-h-72 rounded-xl border border-stroke-soft-200 bg-white-0 px-3 py-4">
                        <motion.div
                            key={`${documentId}-${page}-${isLive ? "live" : "mock"}`}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={chatTransition}
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
                            {!loading && !error && !hasImage && (
                                <>
                                    <div className="text-[11px] uppercase tracking-[0.18em] text-soft-400">
                                        Page {page}
                                    </div>
                                    <p className="mt-3 whitespace-pre-wrap text-p-sm leading-6 text-strong-950">
                                        {extracted ||
                                            "No text available for this page."}
                                    </p>
                                </>
                            )}
                            <div className="mt-10 flex justify-between text-[10px] text-soft-400">
                                <span>
                                    {isLive ? "COAir document" : "COAir preview"}
                                </span>
                                <span>{pageRef(displayName, page)}</span>
                            </div>
                        </motion.div>
                    </div>
                    <div className="mt-4 text-label-xs uppercase tracking-[0.16em] text-soft-400">
                        Extracted text
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-label-sm leading-6 text-sub-600">
                        {loading ? "Loading…" : extracted || "No extracted text."}
                    </p>
                </div>
            </div>
        </motion.aside>
    );
};

export default SourcePdfPreview;
