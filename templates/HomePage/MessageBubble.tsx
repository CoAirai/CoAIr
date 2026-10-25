"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { answerDocumentPayload, downloadAnswerExport, saveAnswerFile } from "@/lib/coair/answerExports";
import { filterSortRows } from "@/lib/chat/tableRows";
import Image from "@/components/Image";
import SqlResult from "./SqlResult";
import { repeatsSqlTable } from "@/lib/chat/sqlArtifact";
import { useChat } from "@/context/ChatContext";
import {
    citationForReference,
    inlineParts,
    parseAnswer,
    tableCsv,
    type AnswerPart,
} from "@/lib/chat/answerText";
import type { Citation, Message } from "@/lib/chat/types";

function AnswerParts({
    parts,
    citations,
    onOpen,
}: {
    parts: AnswerPart[];
    citations?: Citation[];
    onOpen: (citation: Citation) => void;
}) {
    return (
        <>
            {parts.map((part, index) => {
                if (part.type === "bold") {
                    return (
                        <strong key={index} className="font-semibold">
                            {part.text}
                        </strong>
                    );
                }
                if (part.type === "cite") {
                    return (
                        <button
                            key={index}
                            type="button"
                            className="text-blue-500 underline decoration-blue-500/30 underline-offset-2 hover:decoration-blue-500"
                            onClick={() =>
                                onOpen(
                                    citationForReference(
                                        part.name,
                                        part.page,
                                        citations
                                    )
                                )
                            }
                        >
                            {part.name}
                            {part.page ? `, p.${part.page}` : ""}
                        </button>
                    );
                }
                return <span key={index}>{part.text}</span>;
            })}
        </>
    );
}

function downloadTable(headers: string[], rows: string[][]) {
    const blob = new Blob([tableCsv(headers, rows)], {
        type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "coair-table.csv";
    link.click();
    URL.revokeObjectURL(url);
}

function AnswerTable({
    headers,
    rows,
    citations,
    onOpen,
    values,
}: {
    headers: string[];
    rows: string[][];
    values?: unknown[][];
    citations?: Citation[];
    onOpen: (citation: Citation) => void;
}) {
    const { session } = useAuth();
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState<{ column: number; descending: boolean } | null>(null);
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState("");
    const visibleRows = useMemo(() => filterSortRows(rows, search, sort), [rows, search, sort]);
    async function exportExcel() {
        if (!session?.accessToken || !session.projectId) return;
        setExporting(true);
        setExportError("");
        try {
            const blob = await downloadAnswerExport("spreadsheet", session.accessToken, session.projectId, {
                table_columns: headers, table_rows: values ?? rows,
            });
            saveAnswerFile(blob, "coair-table.xlsx");
        } catch (error) {
            setExportError(error instanceof Error ? error.message : "Unable to download Excel workbook.");
        } finally { setExporting(false); }
    }
    return (
        <div className="my-1 overflow-hidden rounded-xl border border-stroke-soft-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stroke-soft-200 bg-weak-50 px-3 py-2">
                <input aria-label="Filter table rows" placeholder="Filter rows" value={search} onChange={event => setSearch(event.target.value)} className="min-w-0 rounded-lg border border-stroke-soft-200 bg-white-0 px-2 py-1 text-label-xs" />
                <span className="text-label-xs text-sub-600">{visibleRows.length} of {rows.length} retained rows</span>
                {session?.accessToken && session.projectId ? <button type="button" disabled={exporting} onClick={() => void exportExcel()} className="rounded-lg border border-stroke-soft-200 bg-white-0 px-2.5 py-1 text-label-xs disabled:opacity-50">{exporting ? "Exporting…" : "Download Excel"}</button> : null}
                <button
                    type="button"
                    className="rounded-lg border border-stroke-soft-200 bg-white-0 px-2.5 py-1 text-label-xs text-strong-950 hover:border-stroke-sub-300"
                    onClick={() => downloadTable(headers, rows)}
                >
                    Download CSV
                </button>
            </div>
            {exportError ? <p role="alert" className="px-3 py-2 text-label-xs text-red-600">{exportError}</p> : null}
            <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] border-collapse text-left">
                    <thead>
                        <tr className="border-b border-stroke-soft-200 bg-weak-50">
                            {headers.map((header, column) => (
                                <th
                                    key={`${header}-${column}`}
                                    aria-sort={sort?.column === column ? (sort.descending ? "descending" : "ascending") : "none"}
                                    className={`px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-sub-600 ${
                                        /value|amount|cost|£/i.test(header)
                                            ? "text-right"
                                            : ""
                                    }`}
                                >
                                    <button type="button" className="font-semibold" onClick={() => setSort(previous => ({ column, descending: previous?.column === column ? !previous.descending : false }))}>
                                        {header}{sort?.column === column ? (sort.descending ? " ↓" : " ↑") : ""}
                                    </button>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {visibleRows.map((row, rowIndex) => (
                            <tr
                                key={rowIndex}
                                className="border-b border-stroke-soft-200 last:border-b-0"
                            >
                                {headers.map((header, column) => (
                                    <td
                                        key={`${rowIndex}-${column}`}
                                        className={`px-3 py-2.5 align-top text-label-sm text-strong-950 ${
                                            /value|amount|cost|£/i.test(header)
                                                ? "whitespace-nowrap text-right tabular-nums"
                                                : ""
                                        } ${column === 1 ? "font-medium" : ""}`}
                                    >
                                        <AnswerParts
                                            parts={inlineParts(
                                                row[column] ?? "",
                                                sourceNames(citations)
                                            )}
                                            citations={citations}
                                            onOpen={onOpen}
                                        />
                                    </td>
                                ))}
                            </tr>
                        ))}
                        {visibleRows.length === 0 ? <tr><td colSpan={headers.length} className="px-3 py-3 text-sub-600">No matching rows.</td></tr> : null}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function sourceNames(citations?: Citation[]) {
    return (citations ?? []).map((citation) => citation.name);
}

type Props = { message: Message };

const MessageBubble = ({ message }: Props) => {
    const { openCitation, openDocumentPreview, messages } = useChat();
    const isUser = message.role === "user";
    const { session } = useAuth();
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState("");
    async function exportWord() {
        if (!session?.accessToken || !session.projectId) return;
        setExporting(true);
        setExportError("");
        try {
            const blob = await downloadAnswerExport("document", session.accessToken, session.projectId, { ...answerDocumentPayload(message), question: messages.slice(0, messages.findIndex(item => item.id === message.id)).reverse().find(item => item.role === "user")?.content ?? "" });
            saveAnswerFile(blob, "coair-answer.docx");
        } catch (error) {
            setExportError(error instanceof Error ? error.message : "Unable to download Word document.");
        } finally { setExporting(false); }
    }
    const blocks = isUser
        ? []
        : parseAnswer(message.content, sourceNames(message.citations)).filter((block) =>
            !(message.sqlArtifact && block.type === "table" &&
                repeatsSqlTable(block.headers, block.rows, message.sqlArtifact))
        );
    const hasTable = Boolean(message.sqlArtifact) || blocks.some((block) => block.type === "table");

    return (
        <div
            className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
        >
            {!isUser && (
                <Image
                    className="size-9 shrink-0 rounded-xl object-contain opacity-100"
                    src="/images/coair-logo.png"
                    width={36}
                    height={36}
                    alt=""
                />
            )}
            <div
                className={`min-w-0 rounded-2xl px-4 py-3 text-p-md leading-relaxed ${
                    hasTable ? "w-full max-w-full" : "max-w-[min(40rem,85%)]"
                } ${
                    isUser
                        ? "bg-strong-950 text-white-0"
                        : "border border-stroke-soft-200 bg-white-0 text-strong-950 shadow-[0_1px_2px_rgba(14,18,27,0.04)]"
                }`}
            >
                {isUser &&
                    message.authorName &&
                    message.authorUserId &&
                    message.threadUserId &&
                    message.authorUserId !== message.threadUserId && (
                        <div className="mb-1 text-label-xs text-white-0/70">
                            {message.authorName}
                        </div>
                    )}
                {isUser ? (
                    <div className="whitespace-pre-wrap">{message.content}</div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {blocks.map((block, index) =>
                            block.type === "table" ? (
                                <AnswerTable
                                    key={index}
                                    headers={block.headers}
                                    rows={block.rows}
                                    citations={message.citations}
                                    onOpen={openDocumentPreview}
                                />
                            ) : block.type === "code" ? (
                                <pre key={index} className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-weak-50 p-3 font-mono text-label-sm">{block.text}</pre>
                            ) : block.type === "heading" ? (
                                <div
                                    key={index}
                                    className="font-semibold text-strong-950"
                                >
                                    <AnswerParts
                                        parts={block.parts}
                                        citations={message.citations}
                                        onOpen={openDocumentPreview}
                                    />
                                </div>
                            ) : (
                                <p key={index}>
                                    <AnswerParts
                                        parts={block.parts}
                                        citations={message.citations}
                                        onOpen={openDocumentPreview}
                                    />
                                </p>
                            )
                        )}
                    </div>
                )}
                {!isUser && message.sqlArtifact ? (
                    <SqlResult artifact={message.sqlArtifact} onOpen={openDocumentPreview}>
                        {(headers, rows) => <AnswerTable headers={headers} rows={rows}
                            citations={message.citations} onOpen={openDocumentPreview}
                            values={message.sqlArtifact?.preview_rows.map(row => headers.map(column => row[column] ?? null))} />}
                    </SqlResult>
                ) : null}
                {!isUser && session?.accessToken && session.projectId ? (
                    <div className="mt-3">
                        <button type="button" disabled={exporting} onClick={() => void exportWord()} className="rounded-lg border border-stroke-soft-200 px-2.5 py-1 text-label-xs disabled:opacity-50">{exporting ? "Exporting…" : "Download Word"}</button>
                        {exportError ? <p role="alert" className="mt-1 text-label-xs text-red-600">{exportError}</p> : null}
                    </div>
                ) : null}
                {!isUser && message.libraryNote ? (
                    <p className="mt-2 text-label-xs leading-5 text-sub-600">
                        {message.libraryNote}
                    </p>
                ) : null}
                {!isUser && message.citations && message.citations.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {message.citations.map((citation) => {
                            const active =
                                openCitation?.documentId ===
                                    citation.documentId &&
                                openCitation.page === citation.page;
                            return (
                                <button
                                    key={`${citation.documentId}-${citation.page}`}
                                    type="button"
                                    className={`rounded-lg border px-2.5 py-1 text-label-xs transition-all duration-200 ${
                                        active
                                            ? "border-strong-950 bg-weak-50 text-strong-950"
                                            : "border-stroke-soft-200 text-sub-600 hover:border-stroke-sub-300 hover:text-strong-950"
                                    }`}
                                    onClick={() => openDocumentPreview(citation)}
                                >
                                    {citation.name}
                                    {citation.page ? `, p.${citation.page}` : ""}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MessageBubble;
