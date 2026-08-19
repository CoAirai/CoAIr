"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import ModalSettings from "@/components/ModalSettings";
import Image from "@/components/Image";
import AvatarMenu from "@/components/AvatarMenu";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { redirectToSignIn } from "@/lib/auth/portalNav";
import { useChat } from "@/context/ChatContext";
import { useLiveWorkspace } from "@/context/LiveWorkspaceContext";
import { chatTransition } from "@/lib/chat/motion";
import { activeWorkspaceUsers } from "@/lib/chat/threads";
type Props = {
    onOpenSidebar: () => void;
};

function initials(name: string) {
    return name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
}

const Header = ({ onOpenSidebar }: Props) => {
    const router = useRouter();
    const pathname = usePathname();
    const isChronology = pathname.startsWith("/workspace/chronology");
    const isForensic = pathname.startsWith("/workspace/forensic");
    const moduleLabel = isChronology
        ? "chronology"
        : isForensic
          ? "forensic"
          : "chat";
    const [openSettings, setOpenSettings] = useState(false);
    const { session, signOut } = useAuth();
    const { users } = useAdminData();
    const { activeWorkspaceUserId, setActiveWorkspaceUserId } = useChat();
    const { enabled: liveEnabled, projects, selectProject } = useLiveWorkspace();

    const teammates = useMemo(
        () =>
            session?.companyId
                ? activeWorkspaceUsers(users, session.companyId)
                : [],
        [session?.companyId, users]
    );
    const workspaceUser =
        teammates.find((user) => user.id === activeWorkspaceUserId) ??
        teammates.find((user) => user.id === session?.userId) ??
        null;

    return (
        <>
            <div className="flex items-center gap-4 mb-3.5 max-md:gap-2 max-md:mb-3">
                <button
                    className="hidden size-10 mr-2 justify-center items-center max-lg:flex max-md:mr-0"
                    onClick={onOpenSidebar}
                    type="button"
                >
                    <Icon className="!size-6 fill-strong-950" name="burger" />
                </button>
                <div className="grow flex items-center gap-3 min-w-0">
                    <Image
                        className="h-8 w-auto shrink-0 rounded-xl object-contain opacity-100 max-md:h-7"
                        src="/images/coair-logo.png"
                        width={120}
                        height={32}
                        alt="COAir"
                    />
                    <div className="min-w-0">
                        <div className="text-label-xl max-md:text-label-md">
                            {isChronology
                                ? "COAir - chronology"
                                : isForensic
                                  ? "COAir - forensic"
                                  : "COAir - workspace"}
                        </div>
                        <div className="mt-1 line-clamp-1 text-label-md text-sub-600 max-lg:hidden">
                            <AnimatePresence mode="wait" initial={false}>
                                <motion.span
                                    key={
                                        session?.role === "company_admin"
                                            ? `${moduleLabel}-${workspaceUser?.id ?? "admin"}`
                                            : moduleLabel
                                    }
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    transition={chatTransition}
                                    className="block"
                                >
                                    {session?.role === "company_admin" &&
                                    workspaceUser
                                        ? `Working in ${workspaceUser.name}'s ${moduleLabel}`
                                        : isChronology
                                          ? "Build timelines from verified project sources."
                                          : isForensic
                                            ? "Programme / deterministic engine."
                                            : "AI-powered analytics. Verify critical decisions."}
                                </motion.span>
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
                <div className="flex shrink-0 gap-1.5 items-center">
                    {liveEnabled && projects.length > 0 && (
                        <select
                            aria-label="Project"
                            className="h-10 max-w-52 rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-label-sm text-strong-950 outline-none transition-colors duration-200 hover:border-stroke-sub-300"
                            value={session?.projectId ?? ""}
                            onChange={(event) =>
                                selectProject(event.target.value)
                            }
                        >
                            {projects.map((project) => (
                                <option
                                    key={project.project_id}
                                    value={project.project_id}
                                >
                                    {project.name}
                                </option>
                            ))}
                        </select>
                    )}
                    {session?.role === "company_admin" && (
                        <label className="sr-only" htmlFor="workspace-user">
                            Switch user
                        </label>
                    )}
                    {session?.role === "company_admin" && teammates.length > 0 && (
                        <select
                            id="workspace-user"
                            className="h-10 max-w-44 rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-label-sm text-strong-950 outline-none transition-colors duration-200 hover:border-stroke-sub-300"
                            value={activeWorkspaceUserId ?? session.userId ?? ""}
                            onChange={(event) =>
                                setActiveWorkspaceUserId(event.target.value)
                            }
                        >
                            {teammates.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {user.name}
                                </option>
                            ))}
                        </select>
                    )}
                    <AvatarMenu
                        initials={initials(session?.name ?? "U") || "U"}
                        name={session?.name}
                        email={session?.email}
                        onSettings={() => setOpenSettings(true)}
                        onSignOut={async () => {
                            await signOut();
                            redirectToSignIn(router);
                        }}
                    />
                </div>
            </div>
            <ModalSettings
                open={openSettings}
                onClose={() => setOpenSettings(false)}
            />
        </>
    );
};

export default Header;
