"use client";

import { useRef, useState, type ChangeEvent, type PointerEvent } from "react";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";
import Image from "@/components/Image";
import ModalSettings from "@/components/ModalSettings";
import Button from "@/components/Button";
import User from "./User";
import KnowledgeBase from "./KnowledgeBase";
import RecentQueries from "./RecentQueries";
import CaCredits from "./CaCredits";
import ForensicNav from "./ForensicNav";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import { useLiveWorkspace } from "@/context/LiveWorkspaceContext";
import { useToast } from "@/context/ToastContext";
import type { CompanyDocumentKind } from "@/lib/admin/companyDocuments";

const FILE_KINDS: Record<CompanyDocumentKind, { exts: string[]; hint: string }> = {
    document: {
        exts: [".pdf", ".doc", ".docx"],
        hint: "Add documents takes PDF and Word files. Use Sheets or Mail for the others.",
    },
    spreadsheet: {
        exts: [".xls", ".xlsx", ".csv"],
        hint: "Sheets takes Excel and CSV files.",
    },
    csv: {
        exts: [".csv"],
        hint: "Sheets takes Excel and CSV files.",
    },
    communication: {
        exts: [".txt"],
        hint: "Mail takes text files.",
    },
};

function fileExtension(name: string) {
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

type Props = {
    visible: boolean;
    width: number;
    sized: boolean;
    resizable: boolean;
    resizing: boolean;
    onResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
    onClose: () => void;
    onClickNewChat: () => void;
};

const Sidebar = ({
    visible,
    width,
    sized,
    resizable,
    resizing,
    onResizeStart,
    onClose,
    onClickNewChat,
}: Props) => {
    const [open, setOpen] = useState(false);
    const pathname = usePathname();
    const isChronology = pathname.startsWith("/workspace/chronology");
    const isForensic = pathname.startsWith("/workspace/forensic");
    const isModuleSidebar = isChronology || isForensic;
    const { clearChat } = useChat();
    const { session } = useAuth();
    const { addCompanyDocument } = useAdminData();
    const live = useLiveWorkspace();
    const { pushToast } = useToast();
    const documentInputRef = useRef<HTMLInputElement>(null);
    const csvInputRef = useRef<HTMLInputElement>(null);
    const mailInputRef = useRef<HTMLInputElement>(null);

    const onPickFile = (
        event: ChangeEvent<HTMLInputElement>,
        kind: CompanyDocumentKind
    ) => {
        const files = Array.from(event.target.files || []);
        event.target.value = "";
        if (!files.length || !session?.companyId || !session.userId) return;
        const allowed = new Set(FILE_KINDS[kind].exts);
        const matched = files.filter((file) => allowed.has(fileExtension(file.name)));
        if (!matched.length) {
            pushToast(FILE_KINDS[kind].hint, "info");
            return;
        }
        if (matched.length < files.length) {
            pushToast(FILE_KINDS[kind].hint, "info");
        }
        if (live.enabled) {
            void live.uploadFiles(matched);
            return;
        }
        for (const file of matched) {
            addCompanyDocument({
                companyId: session.companyId,
                name: file.name,
                kind,
                addedByUserId: session.userId,
            });
        }
    };

    return (
        <>
            <div
                    className={`fixed top-5 left-5 bottom-5 z-20 flex flex-col bg-white-0 rounded-3xl shadow-[0_0_1.25rem_0_rgba(0,0,0,0.03)] ease-out max-lg:top-0 max-lg:left-0 max-lg:bottom-0 max-lg:!w-75 max-lg:shadow-2xl max-lg:rounded-none max-md:!w-full max-md:p-4 ${
                    resizing ? "" : "transition-transform duration-300"
                } ${
                    visible
                        ? "translate-x-0"
                        : "pointer-events-none -translate-x-[calc(100%+3rem)]"
                }`}
                style={sized ? { width } : undefined}
                aria-hidden={!visible}
                inert={!visible}
            >
                {resizable && (
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize sidebar"
                        aria-valuemin={260}
                        aria-valuemax={560}
                        aria-valuenow={width}
                        className="absolute inset-y-0 -right-1 z-30 w-2 cursor-col-resize touch-none"
                        onPointerDown={onResizeStart}
                    />
                )}
                <div className="grow overflow-auto scrollbar-none p-5 flex flex-col">
                    <div className="flex items-center gap-2 mb-5 max-lg:pr-2 max-md:mb-3">
                        <button
                            type="button"
                            className="flex items-center gap-2.5 grow min-w-0 text-left"
                            onClick={() => {
                                clearChat();
                                onClickNewChat();
                            }}
                        >
                            <Image
                                className="h-8 w-auto shrink-0 rounded-xl object-contain opacity-100"
                                src="/images/coair-logo.png"
                                width={120}
                                height={32}
                                alt="COAIr"
                            />
                            {isForensic ? (
                                <span className="min-w-0">
                                    <span className="block truncate text-label-sm text-strong-950">
                                        COAIr - forensic
                                    </span>
                                    <span className="mt-0.5 block truncate text-[11px] leading-4 text-sub-600">
                                        Programme / deterministic engine.
                                    </span>
                                </span>
                            ) : null}
                        </button>
                        <button
                            className="group ml-2 flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-weak-50"
                            onClick={onClose}
                            type="button"
                            aria-label="Close sidebar"
                        >
                            <Icon
                                className="text-label-sm fill-strong-950 transition-colors group-hover:fill-blue-500"
                                name="close"
                            />
                        </button>
                    </div>

                    {isForensic ? (
                        <ForensicNav />
                    ) : !isChronology ? (
                        <KnowledgeBase />
                    ) : (
                        <>
                            <CaCredits />
                            <Button
                                className="mb-5 w-full"
                                icon="plus"
                                isBlack
                                onClick={onClickNewChat}
                            >
                                Build new chronology
                            </Button>
                        </>
                    )}
                    {isForensic ? null : <RecentQueries />}

                    {!isModuleSidebar ? (
                    <div className="mt-auto flex w-full min-w-0 flex-wrap items-center gap-2 pt-4">
                        <input
                            ref={documentInputRef}
                            type="file"
                            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            multiple
                            className="hidden"
                            onChange={(event) => onPickFile(event, "document")}
                        />
                        <input
                            ref={csvInputRef}
                            type="file"
                            accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                            multiple
                            className="hidden"
                            onChange={(event) => onPickFile(event, "spreadsheet")}
                        />
                        <input
                            ref={mailInputRef}
                            type="file"
                            accept=".txt,text/plain"
                            multiple
                            className="hidden"
                            onChange={(event) => onPickFile(event, "communication")}
                        />
                        <Button
                            className="grow shrink-0"
                            icon="plus"
                            isBlack
                            onClick={() => documentInputRef.current?.click()}
                        >
                            Add documents
                        </Button>
                        <Button
                            className="shrink-0"
                            isStroke
                            onClick={() => csvInputRef.current?.click()}
                        >
                            Sheets
                        </Button>
                        <Button
                            className="shrink-0"
                            isStroke
                            onClick={() => mailInputRef.current?.click()}
                        >
                            Mail
                        </Button>
                    </div>
                    ) : (
                        <div className="mt-auto" />
                    )}

                    <div className="mt-4">
                        <button
                            type="button"
                            className="group flex items-center shrink-0 gap-2 h-10 px-3 rounded-xl text-label-sm transition-colors hover:text-blue-500 w-full"
                            onClick={() => setOpen(true)}
                        >
                            <Icon
                                className="fill-strong-950 transition-colors group-hover:fill-blue-500"
                                name="settings"
                            />
                            Settings
                        </button>
                    </div>
                </div>
                <User />
            </div>
            <ModalSettings open={open} onClose={() => setOpen(false)} />
        </>
    );
};

export default Sidebar;
