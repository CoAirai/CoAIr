"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import ModalSettings from "@/components/ModalSettings";
import Image from "@/components/Image";
import AvatarMenu from "@/components/AvatarMenu";
import ProjectSwitcher from "@/components/Header/ProjectSwitcher";
import ResponseBell from "@/components/Header/ResponseBell";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { redirectToSignInAfterLogout } from "@/lib/auth/portalNav";
import { useChat } from "@/context/ChatContext";
import { useLiveWorkspace } from "@/context/LiveWorkspaceContext";
import { activeWorkspaceUsers } from "@/lib/chat/threads";
import { workspaceLogo } from "@/lib/workspace/moduleAccess";
type Props = {
    sidebarOpen: boolean;
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

const Header = ({ sidebarOpen, onOpenSidebar }: Props) => {
    const router = useRouter();
    const logo = workspaceLogo(usePathname());
    const [openSettings, setOpenSettings] = useState(false);
    const { session, signOut } = useAuth();
    const { users } = useAdminData();
    const { activeWorkspaceUserId, setActiveWorkspaceUserId } = useChat();
    const {
        enabled: liveEnabled,
        loading: liveLoading,
        teammates: liveTeammates,
    } = useLiveWorkspace();

    const teammates = useMemo(() => {
        if (liveEnabled && session?.role === "company_admin") {
            if (!session.companyId) return [];
            if (liveTeammates.length > 0) {
                return activeWorkspaceUsers(liveTeammates, session.companyId);
            }
            if (session.userId) {
                return [
                    {
                        id: session.userId,
                        name: session.name || session.userId,
                        companyId: session.companyId,
                        status: "active",
                        role: "admin",
                    },
                ];
            }
            return [];
        }
        return session?.companyId
            ? activeWorkspaceUsers(users, session.companyId)
            : [];
    }, [
        liveEnabled,
        liveTeammates,
        session?.companyId,
        session?.name,
        session?.role,
        session?.userId,
        users,
    ]);
    return (
        <>
            <div className="flex items-center gap-4 mb-3.5 max-md:gap-2 max-md:mb-3">
                <button
                    className={`size-10 mr-2 items-center justify-center max-md:mr-0 ${
                        sidebarOpen ? "hidden" : "flex"
                    }`}
                    onClick={onOpenSidebar}
                    type="button"
                    aria-label="Open sidebar"
                >
                    <Icon className="!size-6 fill-strong-950" name="burger" />
                </button>
                <div className="flex min-w-0 grow items-center gap-3">
                    <Image
                        className="h-8 w-auto shrink-0 rounded-xl object-contain opacity-100 max-md:h-7"
                        src={logo.src}
                        width={120}
                        height={32}
                        alt={logo.alt}
                    />
                    <ProjectSwitcher />
                </div>
                <div className="flex shrink-0 gap-3 items-center">
                    {session?.role === "company_admin" && (
                        <label className="sr-only" htmlFor="workspace-user">
                            Switch user
                        </label>
                    )}
                    {session?.role === "company_admin" && teammates.length > 0 && (
                        <select
                            id="workspace-user"
                            className="h-10 max-w-44 rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-label-sm text-strong-950 outline-none transition-colors duration-200 hover:border-stroke-sub-300 max-lg:max-w-28"
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
                    {session?.role === "company_admin" &&
                        liveEnabled &&
                        liveLoading &&
                        liveTeammates.length === 0 && (
                            <div
                                aria-hidden
                                className="h-10 w-32 animate-pulse rounded-xl border border-stroke-soft-200 bg-weak-50"
                            />
                        )}
                    <div className="min-w-0 max-w-40 text-right max-lg:hidden">
                        {session?.companyName ? (
                            <div className="truncate text-label-sm text-strong-950">
                                {session.companyName}
                            </div>
                        ) : null}
                        <div className="truncate text-label-xs text-sub-600">
                            COAIr
                        </div>
                    </div>
                    <ResponseBell />
                    <AvatarMenu
                        initials={initials(session?.name ?? "U") || "U"}
                        name={session?.name}
                        email={session?.email}
                        onSettings={() => setOpenSettings(true)}
                        onSignOut={async () => {
                            await signOut();
                            redirectToSignInAfterLogout(router);
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
