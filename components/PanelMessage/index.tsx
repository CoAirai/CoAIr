"use client";

import { useState, type KeyboardEvent } from "react";
import TextareaAutosize from "react-textarea-autosize";
import Image from "@/components/Image";
import { useChat } from "@/context/ChatContext";

const PanelMessage = () => {
    const { sendMessage, stopReply, isReplying, sendError } = useChat();
    const [message, setMessage] = useState("");

    // Clear straight away: the reply can arrive after the user has moved to
    // another chat and started typing there.
    const submit = async () => {
        const text = message;
        if (!text.trim()) return;
        setMessage("");
        const sent = await sendMessage(text);
        if (!sent) setMessage((current) => current || text);
    };

    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!isReplying && message.trim()) void submit();
        }
    };

    const canSend = !isReplying && Boolean(message.trim());

    return (
        <div className="relative z-3 mx-7.5 mb-5.5 shrink-0 rounded-2xl border border-stroke-soft-200 bg-white-0 shadow-[0_1px_2px_rgba(14,18,27,0.04)] max-md:mx-0 max-md:mb-0 max-md:rounded-xl">
            <div className="flex items-end gap-3 px-4 py-3.5 max-md:px-3 max-md:py-3">
                <div className="min-h-12 min-w-0 flex-1 text-0">
                    <TextareaAutosize
                        className="w-full h-12 text-p-md text-strong-950 outline-none resize-none placeholder:text-soft-400 disabled:opacity-60"
                        maxRows={5}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="Ask anything about your project data…"
                        disabled={isReplying}
                        aria-label="Message"
                    />
                    {sendError ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-label-sm text-red-500">
                            <span>{sendError}</span>
                            <button
                                type="button"
                                className="text-blue-500 hover:underline disabled:opacity-60"
                                disabled={isReplying}
                                onClick={() => void submit()}
                            >
                                Retry
                            </button>
                        </div>
                    ) : null}
                </div>
                <button
                    type="button"
                    className="mb-1 flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl bg-strong-950 px-2 text-label-xs text-white-0 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
                    disabled={isReplying ? false : !canSend}
                    onClick={() => {
                        if (isReplying) {
                            stopReply();
                            return;
                        }
                        void submit();
                    }}
                    aria-label={isReplying ? "Stop reply" : "Send message"}
                >
                    {isReplying ? (
                        "Stop"
                    ) : (
                        <Image
                            className="w-4 opacity-100 invert"
                            src="/images/sent.svg"
                            width={16}
                            height={16}
                            alt=""
                        />
                    )}
                </button>
            </div>
        </div>
    );
};

export default PanelMessage;
