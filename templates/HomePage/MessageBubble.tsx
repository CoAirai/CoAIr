import Image from "@/components/Image";
import { useChat } from "@/context/ChatContext";
import type { Message } from "@/lib/chat/types";

type Props = { message: Message };

const MessageBubble = ({ message }: Props) => {
    const { openCitation, openDocumentPreview } = useChat();
    const isUser = message.role === "user";

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
                className={`max-w-[min(40rem,85%)] rounded-2xl px-4 py-3 text-p-md leading-relaxed ${
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
                <div className="whitespace-pre-wrap">{message.content}</div>
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
