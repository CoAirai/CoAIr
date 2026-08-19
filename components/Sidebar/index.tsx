"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";
import Image from "@/components/Image";
import ModalSettings from "@/components/ModalSettings";
import Button from "@/components/Button";
import User from "./User";
import KnowledgeBase from "./KnowledgeBase";
import RecentQueries from "./RecentQueries";
import ForensicNav from "./ForensicNav";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import { useLiveWorkspace } from "@/context/LiveWorkspaceContext";
import type { CompanyDocumentKind } from "@/lib/admin/companyDocuments";

type Props = {
    visible: boolean;
    onClose: () => void;
    onClickNewChat: () => void;
};

const Sidebar = ({ visible, onClose, onClickNewChat }: Props) => {
    const [open, setOpen] = useState(false);
    const pathname = usePathname();
    const isChronology = pathname.startsWith("/workspace/chronology");
    const isForensic = pathname.startsWith("/workspace/forensic");
    const isModuleSidebar = isChronology || isForensic;
    const { clearChat } = useChat();
    const { session } = useAuth();
    const { addCompanyDocument } = useAdminData();
    const live = useLiveWorkspace();
    const documentInputRef = useRef<HTMLInputElement>(null);
    const csvInputRef = useRef<HTMLInputElement>(null);

    const onPickFile = (
        event: ChangeEvent<HTMLInputElement>,
        kind: CompanyDocumentKind
    ) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file || !session?.companyId || !session.userId) return;
        if (live.enabled) {
            void live.uploadFile(file);
            return;
        }
        addCompanyDocument({
            companyId: session.companyId,
            name: file.name,
            kind,
            addedByUserId: session.userId,
        });
    };

    return (
        <>
            <div
                    className={`fixed top-5 left-5 bottom-5 flex flex-col w-80 bg-white-0 rounded-3xl shadow-[0_0_1.25rem_0_rgba(0,0,0,0.03)] max-3xl:w-65 max-lg:top-0 max-lg:left-0 max-lg:bottom-0 max-lg:z-20 max-lg:w-75 max-lg:shadow-2xl max-lg:rounded-none max-lg:transition-transform max-lg:duration-300 max-lg:ease-out max-md:w-full max-md:p-4 ${
                    visible
                        ? "max-lg:translate-x-0"
                        : "max-lg:-translate-x-full"
                }`}
            >
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
                                alt="COAir"
                            />
                            {isForensic ? (
                                <span className="min-w-0">
                                    <span className="block truncate text-label-sm text-strong-950">
                                        COAir - forensic
                                    </span>
                                    <span className="mt-0.5 block truncate text-[11px] leading-4 text-sub-600">
                                        Programme / deterministic engine.
                                    </span>
                                </span>
                            ) : null}
                        </button>
                        <button
                            className="group hidden ml-2 max-lg:flex"
                            onClick={onClose}
                            type="button"
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
                        <Button
                            className="mb-5 w-full"
                            icon="plus"
                            isBlack
                            onClick={onClickNewChat}
                        >
                            Build new chronology
                        </Button>
                    )}
                    {isForensic ? null : <RecentQueries />}

                    {!isModuleSidebar ? (
                    <div className="mt-auto pt-4 flex items-center gap-2">
                        <input
                            ref={documentInputRef}
                            type="file"
                            className="hidden"
                            onChange={(event) => onPickFile(event, "document")}
                        />
                        <input
                            ref={csvInputRef}
                            type="file"
                            accept=".csv,text/csv"
                            className="hidden"
                            onChange={(event) => onPickFile(event, "csv")}
                        />
                        <Button
                            className="grow"
                            icon="plus"
                            isBlack
                            onClick={() => documentInputRef.current?.click()}
                        >
                            Add document
                        </Button>
                        <Button
                            isStroke
                            onClick={() => csvInputRef.current?.click()}
                        >
                            CSV
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
