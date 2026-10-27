"use client";

import { AnimatePresence, motion } from "framer-motion";
import Layout from "@/components/Layout";
import Image from "@/components/Image";
import PanelMessage from "@/components/PanelMessage";
import DocumentPreview from "@/components/Chat/DocumentPreview";
import ReplyOrb from "@/components/Chat/ReplyOrb";
import { useChat } from "@/context/ChatContext";
import { chatTransition } from "@/lib/chat/motion";
import MessageBubble from "./MessageBubble";

const HomePage = () => {
    const { messages, isReplying, replyActivity, replyDraft, activeWorkspaceUserId, sendMessage } =
        useChat();
    const examples = [
        "Which notices were issued this month?",
        "What does the latest programme update change?",
        "Summarise the delay events in the correspondence.",
    ];
    const isEmpty = messages.length === 0;

    return (
        <Layout>
            <div className="chat-wrapper relative border border-stroke-soft-200 shadow-[0_1px_2px_rgba(14,18,27,0.04),0_8px_24px_-16px_rgba(14,18,27,0.08)]">
                <div className="flex min-h-0 flex-1">
                    <div className="flex min-w-0 flex-1 flex-col">
                        <div className="-mb-3 grow overflow-auto px-7.5 pb-12 pt-18 scrollbar-none max-md:px-4 max-md:pb-8 max-md:pt-4">
                            <AnimatePresence mode="wait" initial={false}>
                                {isEmpty ? (
                                    <motion.div
                                        key="empty"
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        transition={chatTransition}
                                        className="mb-12 text-center max-md:mb-6"
                                    >
                                        <Image
                                            className="mx-auto mb-4 w-40 rounded-xl object-contain opacity-100"
                                            src="/images/coair-logo.png"
                                            width={160}
                                            height={64}
                                            alt="COAIr"
                                        />
                                        <div className="mb-2 text-h3 tracking-tight max-md:mb-1.5 max-md:text-[1.6rem]">
                                            COAIr
                                        </div>
                                        <div className="mx-auto max-w-120 text-p-xl leading-relaxed text-sub-600 max-md:text-p-sm">
                                            Chat, cite, and verify against your
                                            project documents.
                                        </div>
                                        <div className="mx-auto mt-6 flex max-w-xl flex-col gap-2">
                                            {examples.map((example) => (
                                                <button
                                                    key={example}
                                                    type="button"
                                                    className="rounded-xl border border-stroke-soft-200 bg-white-0 px-4 py-3 text-left text-label-sm text-strong-950 hover:border-stroke-sub-300"
                                                    onClick={() =>
                                                        void sendMessage(example)
                                                    }
                                                >
                                                    {example}
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key={activeWorkspaceUserId ?? "thread"}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        transition={chatTransition}
                                        className="mx-auto flex w-full max-w-180 flex-col gap-4.5"
                                    >
                                        <AnimatePresence initial={false}>
                                            {messages.map((m) => (
                                                <motion.div
                                                    key={m.id}
                                                    initial={{
                                                        opacity: 0,
                                                        y: 12,
                                                    }}
                                                    animate={{
                                                        opacity: 1,
                                                        y: 0,
                                                    }}
                                                    exit={{
                                                        opacity: 0,
                                                        y: -8,
                                                    }}
                                                    transition={chatTransition}
                                                    layout
                                                >
                                                    <MessageBubble message={m} />
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                        {isReplying && (
                                            <motion.div
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                            >
                                                <ReplyOrb activity={replyActivity} />
                                                {replyDraft ? <div className="mt-4">
                                                    <p className="mb-2 text-label-xs text-sub-600">Writing answer · final response pending</p>
                                                    <MessageBubble message={{ id: "streaming-answer", role: "assistant", content: replyDraft,
                                                        createdAt: "", streaming: true }} />
                                                </div> : null}
                                            </motion.div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        <PanelMessage />
                    </div>
                    <DocumentPreview />
                </div>
            </div>
        </Layout>
    );
};

export default HomePage;
