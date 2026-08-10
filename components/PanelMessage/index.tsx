"use client";

import { useState, type KeyboardEvent } from "react";
import TextareaAutosize from "react-textarea-autosize";
import Icon from "@/components/Icon";
import Image from "@/components/Image";
import { useChat } from "@/context/ChatContext";

const PanelMessage = () => {
    const { sendMessage, isReplying, sendError } = useChat();
    const [message, setMessage] = useState("");

    const submit = async () => {
        const text = message;
        setMessage("");
        await sendMessage(text);
    };

    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!isReplying && message.trim()) void submit();
        }
    };

    return (
        <div className="relative z-3 mx-7.5 mb-5.5 shrink-0 rounded-xl border border-stroke-soft-200 bg-white-0 max-md:m-0">
            <div className="px-3 py-3.5 max-md:px-4 max-md:py-2.5">
                <div className="min-h-12 text-0 mb-3">
                    <TextareaAutosize
                        className="w-full h-12 text-p-md text-strong-950 outline-none resize-none placeholder:text-soft-400"
                        maxRows={5}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="Ask anything..."
                        disabled={isReplying}
                    />
                    {sendError && (
                        <div className="mt-2 text-label-sm text-red-500 transition-opacity duration-200">
                            {sendError}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2.5">
                    <button
                        type="button"
                        className="group text-0"
                        onClick={() => {}}
                        aria-label="Attach"
                    >
                        <Icon
                            className="fill-icon-soft-400 transition-colors group-hover:fill-blue-500"
                            name="link"
                        />
                    </button>
                    <div className="ml-auto" />
                    <button
                        type="button"
                        className="group text-0 disabled:opacity-40"
                        disabled={isReplying || !message.trim()}
                        onClick={() => void submit()}
                        aria-label="Send"
                    >
                        <Image
                            className="w-5 opacity-100"
                            src="/images/sent.svg"
                            width={20}
                            height={20}
                            alt="Send"
                        />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PanelMessage;
