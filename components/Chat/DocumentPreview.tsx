"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Icon from "@/components/Icon";
import { useChat } from "@/context/ChatContext";
import {
    fileKindLabel,
    getDocumentPreview,
    pageRef,
} from "@/lib/chat/citations";
import { chatSpring, chatTransition } from "@/lib/chat/motion";
import type { Citation } from "@/lib/chat/types";

const PANEL_WIDTH = 352;

const DocumentPreview = () => {
    const { openCitation, closeDocumentPreview } = useChat();
    const lastCitation = useRef<Citation | null>(openCitation);
    if (openCitation) lastCitation.current = openCitation;
    const citation = openCitation ?? lastCitation.current;
    const preview = citation
        ? getDocumentPreview(citation.documentId, citation.name)
        : null;
    const [page, setPage] = useState(citation?.page ?? 1);
    const open = Boolean(openCitation && preview);

    useEffect(() => {
        if (openCitation) setPage(openCitation.page);
    }, [openCitation?.documentId, openCitation?.page]);

    const current =
        preview?.pages.find((entry) => entry.page === page) ?? preview?.pages[0];
    const kind = preview ? fileKindLabel(preview.name) : "FILE";

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
                    {preview?.name}
                </div>
                <div className="flex shrink-0 items-center gap-1 text-label-xs text-sub-600">
                    <button
                        type="button"
                        className="rounded-lg px-1.5 py-1 hover:bg-weak-50 disabled:opacity-40"
                        disabled={page <= 1}
                        onClick={() => setPage((value) => Math.max(1, value - 1))}
                    >
                        ‹
                    </button>
                    <span className="tabular-nums">
                        {page}/{preview?.pageCount ?? 1}
                    </span>
                    <button
                        type="button"
                        className="rounded-lg px-1.5 py-1 hover:bg-weak-50 disabled:opacity-40"
                        disabled={page >= (preview?.pageCount ?? 1)}
                        onClick={() =>
                            setPage((value) =>
                                Math.min(preview?.pageCount ?? 1, value + 1)
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
                    {preview?.pageCount ?? 0}{" "}
                    {preview?.pageCount === 1 ? "page" : "pages"}
                </span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
                <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-stroke-soft-200 bg-soft-200 p-3">
                    <div className="relative h-full overflow-auto rounded-sm bg-white-0 px-5 py-6 shadow-sm">
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[4rem] font-semibold tracking-[0.35em] text-soft-400/30 rotate-[-28deg]">
                            DRAFT
                        </div>
                        <motion.div
                            key={`${preview?.documentId ?? "doc"}-${page}`}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={chatTransition}
                            className="relative"
                        >
                            <div className="text-[11px] uppercase tracking-[0.18em] text-soft-400">
                                Page {page}
                            </div>
                            {current?.heading && (
                                <div className="mt-4 text-label-md font-semibold text-strong-950">
                                    {current.heading}
                                </div>
                            )}
                            <p className="mt-3 text-p-sm leading-6 text-strong-950">
                                {current?.text}
                            </p>
                            <div className="mt-10 flex items-end justify-between text-[10px] text-soft-400">
                                <span>COAir preview</span>
                                <span className="tabular-nums">
                                    {preview ? pageRef(preview.name, page) : ""}
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
                        key={`extract-${preview?.documentId ?? "doc"}-${page}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={chatTransition}
                        className="max-h-40 overflow-auto pr-1 text-label-sm leading-6 text-strong-950"
                    >
                        <div className="text-label-xs text-soft-400">
                            Page {page}
                        </div>
                        {current?.heading && (
                            <div className="mt-1 font-medium">{current.heading}</div>
                        )}
                        <p className="mt-1 whitespace-pre-wrap text-sub-600">
                            {current?.text}
                        </p>
                    </motion.div>
                </div>
            </div>
            </div>
        </motion.aside>
    );
};

export default DocumentPreview;
