import Image from "@/components/Image";
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
}: {
    headers: string[];
    rows: string[][];
    citations?: Citation[];
    onOpen: (citation: Citation) => void;
}) {
    return (
        <div className="my-1 overflow-hidden rounded-xl border border-stroke-soft-200">
            <div className="flex items-center justify-end border-b border-stroke-soft-200 bg-weak-50 px-3 py-2">
                <button
                    type="button"
                    className="rounded-lg border border-stroke-soft-200 bg-white-0 px-2.5 py-1 text-label-xs text-strong-950 hover:border-stroke-sub-300"
                    onClick={() => downloadTable(headers, rows)}
                >
                    Download CSV
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] border-collapse text-left">
                    <thead>
                        <tr className="border-b border-stroke-soft-200 bg-weak-50">
                            {headers.map((header, column) => (
                                <th
                                    key={`${header}-${column}`}
                                    className={`px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-sub-600 ${
                                        /value|amount|cost|£/i.test(header)
                                            ? "text-right"
                                            : ""
                                    }`}
                                >
                                    {header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIndex) => (
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
    const { openCitation, openDocumentPreview } = useChat();
    const isUser = message.role === "user";
    const blocks = isUser
        ? []
        : parseAnswer(message.content, sourceNames(message.citations));
    const hasTable = blocks.some((block) => block.type === "table");

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
