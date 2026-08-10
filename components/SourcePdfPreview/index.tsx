"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Icon from "@/components/Icon";
import {
    fileKindLabel,
    getDocumentPreview,
    pageRef,
} from "@/lib/chat/citations";
import { chatSpring, chatTransition } from "@/lib/chat/motion";

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
    const preview =
        documentId && name ? getDocumentPreview(documentId, name) : null;
    const [page, setPage] = useState(initialPage);

    useEffect(() => {
        if (open) setPage(initialPage);
    }, [open, documentId, initialPage]);

    const current =
        preview?.pages.find((entry) => entry.page === page) ?? preview?.pages[0];
    const kind = preview ? fileKindLabel(preview.name) : "FILE";

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
                        {preview?.name}
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
                        {preview?.pageCount ?? 0}{" "}
                        {(preview?.pageCount ?? 0) === 1 ? "page" : "pages"}
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            disabled={page <= 1}
                            className="px-1.5 disabled:opacity-40"
                            onClick={() => setPage((value) => Math.max(1, value - 1))}
                        >
                            ‹
                        </button>
                        <span className="tabular-nums">
                            {page}/{preview?.pageCount ?? 1}
                        </span>
                        <button
                            type="button"
                            disabled={page >= (preview?.pageCount ?? 1)}
                            className="px-1.5 disabled:opacity-40"
                            onClick={() =>
                                setPage((value) =>
                                    Math.min(preview?.pageCount ?? 1, value + 1)
                                )
                            }
                        >
                            ›
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto p-4">
                    <div className="relative min-h-72 rounded-xl border border-stroke-soft-200 bg-white-0 px-5 py-6">
                        <motion.div
                            key={`${preview?.documentId}-${page}`}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={chatTransition}
                        >
                            <div className="text-[11px] uppercase tracking-[0.18em] text-soft-400">
                                Page {page}
                            </div>
                            {current?.heading ? (
                                <div className="mt-4 text-label-md font-semibold text-strong-950">
                                    {current.heading}
                                </div>
                            ) : null}
                            <p className="mt-3 text-p-sm leading-6 text-strong-950">
                                {current?.text}
                            </p>
                            <div className="mt-10 flex justify-between text-[10px] text-soft-400">
                                <span>COAir preview</span>
                                <span>
                                    {preview ? pageRef(preview.name, page) : ""}
                                </span>
                            </div>
                        </motion.div>
                    </div>
                    <div className="mt-4 text-label-xs uppercase tracking-[0.16em] text-soft-400">
                        Extracted text
                    </div>
                    <p className="mt-2 text-label-sm leading-6 text-sub-600">
                        {current?.text}
                    </p>
                </div>
            </div>
        </motion.aside>
    );
};

export default SourcePdfPreview;
