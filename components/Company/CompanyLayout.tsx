"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AvatarMenu from "@/components/AvatarMenu";
import Icon from "@/components/Icon";
import Image from "@/components/Image";
import ModalSettings from "@/components/ModalSettings";
import { useAuth } from "@/context/AuthContext";
import { useCompanyData } from "@/context/CompanyDataContext";
import CompanyNav from "./CompanyNav";
import PortalRouteGate from "@/components/Skeleton/PortalRouteGate";
import { CompanyContentSkeleton } from "@/components/Skeleton/portals";

type Props = {
    children: React.ReactNode;
};

const CompanyLayout = ({ children }: Props) => {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const [openSettings, setOpenSettings] = useState(false);
    const router = useRouter();
    const { session, signOut } = useAuth();
    const { company, users, changePassword } = useCompanyData();

    const adminUser = useMemo(
        () => users.find((user) => user.role === "admin") ?? users[0] ?? null,
        [users]
    );
    const initials = (session?.name ?? adminUser?.name ?? "CA")
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("") || "CA";

    return (
        <div
            className={`h-screen overflow-hidden pr-5 transition-[padding] duration-200 max-lg:pl-5 max-md:px-4 ${
                collapsed ? "pl-28" : "pl-90 max-3xl:pl-75"
            }`}
        >
            <aside
                className={`fixed top-5 bottom-5 left-5 z-20 flex flex-col rounded-3xl bg-white-0 shadow-[0_0_1.25rem_0_rgba(0,0,0,0.03)] transition-[width] duration-200 max-lg:top-0 max-lg:bottom-0 max-lg:left-0 max-lg:w-75 max-lg:rounded-none max-lg:shadow-2xl max-lg:transition-transform max-md:w-full ${
                    collapsed ? "w-20" : "w-80 max-3xl:w-65"
                } ${
                    mobileOpen
                        ? "max-lg:translate-x-0"
                        : "max-lg:-translate-x-full"
                }`}
            >
                <div className="flex grow flex-col overflow-hidden p-3 max-lg:p-5">
                    <div
                        className={`mb-5 flex items-center gap-2 ${
                            collapsed ? "flex-col gap-3" : ""
                        }`}
                    >
                        {collapsed ? (
                            <Image
                                className="size-8 rounded-xl object-contain opacity-100"
                                src="/images/coair-logo.png"
                                width={32}
                                height={32}
                                alt="COAir"
                            />
                        ) : (
                            <>
                                <Image
                                    className="h-9 w-auto rounded-xl object-contain opacity-100"
                                    src="/images/coair-logo.png"
                                    width={120}
                                    height={36}
                                    alt="COAir"
                                />
                                <span className="truncate text-label-sm text-sub-600">
                                    Company Admin
                                </span>
                            </>
                        )}

                        <button
                            type="button"
                            className="group ml-auto hidden size-8 shrink-0 items-center justify-center max-lg:flex"
                            onClick={() => setMobileOpen(false)}
                            aria-label="Close company navigation"
                        >
                            <Icon
                                className="fill-strong-950 transition-colors group-hover:fill-blue-500"
                                name="close"
                            />
                        </button>

                        <button
                            type="button"
                            className={`group flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-weak-50 max-lg:hidden ${
                                collapsed ? "ml-0" : "ml-auto"
                            }`}
                            onClick={() => setCollapsed((value) => !value)}
                            aria-label={
                                collapsed
                                    ? "Expand sidebar"
                                    : "Collapse sidebar"
                            }
                            title={collapsed ? "Expand" : "Collapse"}
                        >
                            <Icon
                                className={`fill-sub-600 transition-transform group-hover:fill-blue-500 ${
                                    collapsed ? "rotate-180" : ""
                                }`}
                                name="chevron-circle"
                            />
                        </button>
                    </div>

                    <div className="grow overflow-auto scrollbar-none">
                        <CompanyNav
                            collapsed={collapsed}
                            onNavigate={() => setMobileOpen(false)}
                        />
                    </div>
                </div>

                <div
                    className={`shrink-0 border-t border-stroke-soft-200 ${
                        collapsed ? "p-2 max-lg:mx-2 max-lg:px-2 max-lg:pt-3 max-lg:pb-4" : "mx-2 px-2 pt-3 pb-4"
                    }`}
                >
                    <button
                        type="button"
                        className={`group flex w-full items-center rounded-xl transition-colors hover:bg-weak-50 ${
                            collapsed
                                ? "justify-center p-2 max-lg:justify-start max-lg:gap-2 max-lg:px-2 max-lg:py-2"
                                : "gap-2 px-2 py-2"
                        }`}
                        onClick={() => setOpenSettings(true)}
                        aria-label="Open profile and settings"
                        title="Profile & settings"
                    >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-weak-50 text-label-sm font-medium text-strong-950">
                            {initials}
                        </span>
                        <span
                            className={`min-w-0 grow text-left ${
                                collapsed ? "hidden max-lg:block" : "block"
                            }`}
                        >
                            <span className="block truncate text-label-sm text-strong-950">
                                {session?.name ?? "Company Admin"}
                            </span>
                            <span className="block truncate text-label-xs text-sub-600">
                                {session?.email ?? adminUser?.email ?? ""}
                            </span>
                        </span>
                        <Icon
                            className={`shrink-0 fill-sub-600 transition-colors group-hover:fill-blue-500 ${
                                collapsed ? "hidden max-lg:block" : "block"
                            }`}
                            name="settings"
                        />
                    </button>
                </div>
            </aside>

            <div className="flex h-full flex-col pt-9.5 pb-5 max-2xl:pt-5 max-md:pt-3 max-md:pb-4">
                <header className="mb-3.5 flex shrink-0 items-center gap-4 max-md:mb-3 max-md:gap-2">
                    <button
                        type="button"
                        className="mr-2 hidden size-10 items-center justify-center max-lg:flex max-md:mr-0"
                        onClick={() => setMobileOpen(true)}
                        aria-label="Open company navigation"
                    >
                        <Icon
                            className="!size-6 fill-strong-950"
                            name="burger"
                        />
                    </button>
                    <div className="grow truncate text-label-xl max-md:text-label-md">
                        {company.name}
                    </div>
                    <AvatarMenu
                        initials={initials}
                        name={session?.name ?? "Company Admin"}
                        email={session?.email ?? adminUser?.email ?? ""}
                        workspaceHref="/workspace"
                        onSettings={() => setOpenSettings(true)}
                        onSignOut={() => {
                            signOut();
                            router.replace("/auth/sign-in");
                        }}
                    />
                </header>
                <main className="min-h-0 grow overflow-y-auto pb-1">
                    <PortalRouteGate skeleton={<CompanyContentSkeleton />}>
                        {children}
                    </PortalRouteGate>
                </main>
            </div>

            <div
                className={`fixed inset-0 z-10 hidden bg-overlay backdrop-blur-sm transition-all max-lg:block max-md:hidden ${
                    mobileOpen
                        ? "visible opacity-100"
                        : "invisible opacity-0"
                }`}
                onClick={() => setMobileOpen(false)}
                aria-hidden="true"
            />

            <ModalSettings
                open={openSettings}
                onClose={() => setOpenSettings(false)}
                changePassword={changePassword}
            />
        </div>
    );
};

export default CompanyLayout;
