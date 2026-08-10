"use client";

import { AnimatePresence, motion } from "framer-motion";
import Layout from "@/components/Layout";
import Image from "@/components/Image";
import PanelMessage from "@/components/PanelMessage";
import DocumentPreview from "@/components/Chat/DocumentPreview";
import { useChat } from "@/context/ChatContext";
import { chatTransition } from "@/lib/chat/motion";
import MessageBubble from "./MessageBubble";

const HomePage = () => {
    const { messages, isReplying, activeWorkspaceUserId } = useChat();
    const isEmpty = messages.length === 0;

    return (
        <Layout>
            <div className="chat-wrapper relative">
                <div className="flex min-h-0 flex-1">
                    <div className="flex min-w-0 flex-1 flex-col">
                        <div className="-mb-3 grow overflow-auto pt-18 px-7.5 pb-12 scrollbar-none max-md:pt-4 max-md:px-4 max-md:pb-8">
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
                                            alt="COAir"
                                        />
                                        <div className="mb-3 text-h3 max-md:mb-1.5 max-md:text-[1.6rem]">
                                            COAir
                                        </div>
                                        <div className="max-w-120 mx-auto text-p-xl text-sub-600 max-md:text-p-sm">
                                            chat · cite · verify — your project
                                            data, on demand
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
                                                className="px-1 text-label-sm text-soft-400"
                                            >
                                                COAir is thinking…
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
