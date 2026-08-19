"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Icon from "@/components/Icon";
import TokenUsage from "./TokenUsage";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import { useLiveWorkspace } from "@/context/LiveWorkspaceContext";
import type { CompanyDocument } from "@/lib/admin/companyDocuments";
import { chatTransition } from "@/lib/chat/motion";
import { getTokenMeter } from "@/lib/chat/tokenMeter";

const PAGE_SIZE = 10;

type GroupProps = {
    title: string;
    icon: string;
    items: CompanyDocument[];
    canRemove: boolean;
    defaultOpen?: boolean;
    onOpen: (name: string) => void;
    onRemove: (id: string) => void;
};

const DocumentGroup = ({
    title,
    icon,
    items,
    canRemove,
    defaultOpen = false,
    onOpen,
    onRemove,
}: GroupProps) => {
    const [open, setOpen] = useState(defaultOpen);
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const visible = items.slice(0, visibleCount);
    const hiddenCount = Math.max(0, items.length - visible.length);

    return (
        <div className="mt-2">
            <button
                type="button"
                className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-label-sm text-strong-950 hover:bg-weak-50"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
            >
                <Icon className="shrink-0 fill-strong-950" name={icon} />
                <span className="grow truncate">
                    {title}
                    <span className="ml-1 text-label-xs text-soft-400 tabular-nums">
                        ({items.length})
                    </span>
                </span>
                <Icon
                    className={`shrink-0 fill-soft-400 transition-transform duration-300 ${
                        open ? "rotate-180" : ""
                    }`}
                    name="chevron"
                />
            </button>
            <motion.div
                initial={false}
                animate={{
                    height: open ? "auto" : 0,
                    opacity: open ? 1 : 0,
                }}
                transition={chatTransition}
                className="overflow-hidden"
            >
                <div className="mt-1 flex flex-col gap-0.5">
                    {items.length === 0 && (
                        <div className="px-3 py-2 text-label-xs text-soft-400">
                            No files yet
                        </div>
                    )}
                    <AnimatePresence initial={false}>
                        {visible.map((doc) => (
                            <motion.div
                                key={doc.id}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={chatTransition}
                                className="flex items-center gap-1 rounded-xl px-1"
                            >
                                <button
                                    type="button"
                                    className="flex h-10 min-w-0 grow items-center gap-2 rounded-xl px-2 text-left text-label-sm transition-colors hover:bg-weak-50"
                                    onClick={() => onOpen(doc.name)}
                                >
                                    <Icon
                                        className="shrink-0 fill-strong-950"
                                        name={icon}
                                    />
                                    <span className="truncate">{doc.name}</span>
                                </button>
                                {canRemove && (
                                    <button
                                        type="button"
                                        className="shrink-0 px-2 text-label-xs text-sub-600 transition-colors hover:text-red-500"
                                        onClick={() => onRemove(doc.id)}
                                    >
                                        Remove
                                    </button>
                                )}
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    {hiddenCount > 0 && (
                        <button
                            type="button"
                            className="mx-1 h-9 rounded-xl px-3 text-left text-label-xs text-blue-500 transition-colors hover:bg-weak-50"
                            onClick={() =>
                                setVisibleCount((count) => count + PAGE_SIZE)
                            }
                        >
                            View more · {hiddenCount} left
                        </button>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

const KnowledgeBase = () => {
    const { session } = useAuth();
    const { companies, users, companyWorkspaces, removeCompanyDocument } =
        useAdminData();
    const live = useLiveWorkspace();
    const {
        activeKbId,
        setActiveKbId,
        clearChat,
        askAboutDocument,
        activeWorkspaceUserId,
    } = useChat();
    const documents = live.enabled
        ? live.documents
        : (session?.companyId
              ? companyWorkspaces[session.companyId]?.documents
              : []) ?? [];
    const files = documents.filter(
        (doc) => doc.kind === "document" || doc.kind === "csv"
    );
    const communications = documents.filter(
        (doc) => doc.kind === "communication"
    );
    const sheets = documents.filter((doc) => doc.kind === "spreadsheet");
    const canRemove = session?.role === "company_admin";
    const tokenMeter = useMemo(() => {
        if (live.enabled && live.accountUsage) {
            const used = live.accountUsage.used_tokens ?? 0;
            const limit = live.accountUsage.token_limit ?? 0;
            return getTokenMeter({
                tokenLimit: limit,
                tokensUsed: used,
                personalTokensUsed: used,
            });
        }
        const company = companies.find((entry) => entry.id === session?.companyId);
        const user = users.find((entry) => entry.id === activeWorkspaceUserId);
        if (!company || !user) return null;
        return getTokenMeter({
            tokenLimit: company.tokenLimit,
            tokensUsed: company.tokensUsed,
            tokenSharePercent: user.tokenSharePercent,
            personalTokensUsed: user.personalTokensUsed,
            unusedReleased: user.unusedReleased,
        });
    }, [
        activeWorkspaceUserId,
        companies,
        live.accountUsage,
        live.enabled,
        session?.companyId,
        users,
    ]);

    const removeDoc = (documentId: string) => {
        if (live.enabled) {
            void live.removeFile(documentId);
            return;
        }
        if (!session?.companyId) return;
        removeCompanyDocument({
            companyId: session.companyId,
            documentId,
            actorRole: session.role,
        });
    };

    return (
        <div className="mb-6">
            <div className="mb-2 px-3 text-label-xs text-soft-400">
                Knowledge Base
            </div>
            <div className="flex flex-col gap-1">
                <button
                    type="button"
                    className={`flex min-h-11 items-center gap-2 rounded-xl px-3 py-1 text-left text-label-sm transition-colors ${
                        activeKbId === "assistant"
                            ? "bg-weak-50 dark:shadow-[0_0_0.1875rem_0_rgba(255,255,255,0.16)]"
                            : "hover:text-blue-500"
                    }`}
                    onClick={() => {
                        setActiveKbId("assistant");
                        clearChat();
                    }}
                >
                    <Icon className="shrink-0 fill-strong-950" name="chat" />
                    <span className="truncate">AI Assistant</span>
                    {tokenMeter && (
                        <TokenUsage
                            used={tokenMeter.used}
                            allocation={tokenMeter.allocation}
                            remainingPercent={tokenMeter.remainingPercent}
                        />
                    )}
                </button>

                <DocumentGroup
                    title="Documents"
                    icon="document"
                    items={files}
                    canRemove={canRemove}
                    defaultOpen
                    onOpen={(name) => void askAboutDocument(name)}
                    onRemove={removeDoc}
                />
                <DocumentGroup
                    title="Communications"
                    icon="comment"
                    items={communications}
                    canRemove={canRemove}
                    onOpen={(name) => void askAboutDocument(name)}
                    onRemove={removeDoc}
                />
                <DocumentGroup
                    title="Spreadsheets"
                    icon="analytic"
                    items={sheets}
                    canRemove={canRemove}
                    onOpen={(name) => void askAboutDocument(name)}
                    onRemove={removeDoc}
                />
            </div>
        </div>
    );
};

export default KnowledgeBase;
