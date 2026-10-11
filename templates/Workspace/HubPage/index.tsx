"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import Image from "@/components/Image";
import ProjectSwitcher from "@/components/Header/ProjectSwitcher";
import PageEnter from "@/components/Motion/PageEnter";
import UserAvatar from "@/components/UserAvatar";
import UpgradePackageModal from "@/components/Workspace/UpgradePackageModal";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { useLiveWorkspace } from "@/context/LiveWorkspaceContext";
import { redirectToSignInAfterLogout } from "@/lib/auth/portalNav";
import { companyForSession, resolveLiveAddOns } from "@/lib/workspace/companyForSession";
import { planForCompany } from "@/lib/admin/plans";
import type { ModuleId } from "@/lib/admin/types";
import {
    listOrgModuleAccessRequests,
    listOrgModuleUnlockRequests,
} from "@/lib/coair/ops";
import {
    getModuleGate,
    MODULES,
    moduleStatusLabel,
} from "@/lib/workspace/moduleAccess";
import PortalRouteGate from "@/components/Skeleton/PortalRouteGate";
import { WorkspaceHubSkeleton } from "@/components/Skeleton/portals";

const menuItemClass =
    "flex w-full items-center rounded-lg px-3 py-2 text-left text-label-sm text-sub-600 outline-0 transition-colors data-focus:bg-weak-50 data-focus:text-strong-950";

const HubPage = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { session, signOut } = useAuth();
    const { companies, plans } = useAdminData();
    const { moduleAddOns, enabled: liveEnabled } = useLiveWorkspace();
    const requested = searchParams.get("upgrade") as ModuleId | null;
    const [lockedModule, setLockedModule] = useState<ModuleId | null>(
        requested && MODULES.some((module) => module.id === requested)
            ? requested
            : null
    );
    const [pendingModules, setPendingModules] = useState<Set<string>>(
        new Set()
    );
    const isCompanyAdmin = session?.role === "company_admin";

    const company = useMemo(
        () =>
            companyForSession(session, companies, {
                addOns: resolveLiveAddOns(
                    liveEnabled,
                    moduleAddOns,
                    session?.moduleGrants
                ),
            }),
        [companies, liveEnabled, moduleAddOns, session]
    );
    const plan = planForCompany(company, plans);
    const initials = (session?.name ?? "U")
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
    const reduceMotion = useReducedMotion();

    useEffect(() => {
        if (!session?.accessToken || session.source !== "live") {
            setPendingModules(new Set());
            return;
        }
        const token = session.accessToken;
        void (async () => {
            const pending = new Set<string>();
            const username = session.username || session.email || "";
            const [accessResult, unlockResult] = await Promise.all([
                listOrgModuleAccessRequests(token).catch(() => null),
                isCompanyAdmin
                    ? listOrgModuleUnlockRequests(token).catch(() => null)
                    : Promise.resolve(null),
            ]);
            for (const row of accessResult ?? []) {
                if (row.status === "pending" && row.username === username) {
                    pending.add(String(row.module));
                }
            }
            for (const row of unlockResult?.requests ?? []) {
                if (row.status === "pending") {
                    pending.add(String(row.module));
                }
            }
            setPendingModules(pending);
        })();
    }, [
        isCompanyAdmin,
        session?.accessToken,
        session?.email,
        session?.source,
        session?.username,
    ]);

    if (!company || !plan) {
        return <WorkspaceHubSkeleton />;
    }

    const lockedMeta = lockedModule
        ? MODULES.find((module) => module.id === lockedModule)
        : null;
    const lockedGate = lockedModule
        ? getModuleGate(plan, company, lockedModule, {
              features: session?.features,
              role: session?.role,
          })
        : null;

    return (
        <PortalRouteGate skeleton={<WorkspaceHubSkeleton />}>
            <div className="min-h-screen bg-weak-50/80 text-strong-950">
                <header className="border-b border-stroke-soft-200 bg-white-0/80 backdrop-blur-sm">
                    <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                            <Image
                                className="h-8 w-auto rounded-xl object-contain opacity-100"
                                src="/images/coair-logo.png"
                                width={120}
                                height={32}
                                alt="COAIr"
                            />
                            <ProjectSwitcher />
                        </div>

                        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
                            <div className="min-w-0 text-right">
                                <p className="truncate text-label-sm font-medium tracking-tight text-strong-950">
                                    {company.name}
                                </p>
                                <p className="mt-0.5 truncate text-label-xs text-sub-600">
                                    COAIr · {plan.name}
                                </p>
                            </div>
                            <Menu as="div" className="relative">
                                <MenuButton
                                    className="rounded-xl outline-0 transition-opacity hover:opacity-90"
                                    aria-label="Open account menu"
                                >
                                    <UserAvatar
                                        initials={initials || "U"}
                                        sizeClassName="size-10"
                                        className="rounded-xl"
                                    />
                                </MenuButton>
                                <MenuItems
                                    transition
                                    anchor="bottom end"
                                    modal={false}
                                    className="z-30 w-56 origin-top-right rounded-xl border border-stroke-soft-200 bg-white-0 p-1 shadow-xl outline-0 [--anchor-gap:0.5rem]"
                                >
                                    <div className="border-b border-stroke-soft-200 px-3 py-2">
                                        <div className="truncate text-label-sm text-strong-950">
                                            {session?.name}
                                        </div>
                                        <div className="truncate text-label-xs text-sub-600">
                                            {session?.email}
                                        </div>
                                    </div>
                                    {session?.role === "company_admin" ? (
                                        <MenuItem>
                                            <Link
                                                href="/company"
                                                className={menuItemClass}
                                            >
                                                Company admin
                                            </Link>
                                        </MenuItem>
                                    ) : null}
                                    <MenuItem
                                        as="button"
                                        type="button"
                                        className={menuItemClass}
                                        onClick={async () => {
                                            await signOut();
                                            redirectToSignInAfterLogout(router);
                                        }}
                                    >
                                        Sign out
                                    </MenuItem>
                                </MenuItems>
                            </Menu>
                        </div>
                    </div>
                </header>

                <PageEnter className="mx-auto max-w-6xl px-6 pb-16 pt-12">
                    <div className="text-center">
                        <h1 className="text-4xl font-medium tracking-tight text-strong-950 max-md:text-3xl">
                            What are you working on?
                        </h1>
                        <p className="mx-auto mt-3 max-w-xl text-label-sm leading-relaxed text-sub-600">
                            Pick a module. Your project and documents stay
                            loaded across all three.
                        </p>
                    </div>

                    <div className="mt-10 grid gap-5 md:grid-cols-3">
                        {MODULES.map((module, index) => {
                            const gate = getModuleGate(plan, company, module.id, {
                                features: session?.features,
                                role: session?.role,
                            });
                            const locked = gate.state === "locked";
                            return (
                                <motion.button
                                    key={module.id}
                                    type="button"
                                    initial={
                                        reduceMotion
                                            ? false
                                            : { opacity: 0, y: 16 }
                                    }
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{
                                        duration: 0.36,
                                        delay: reduceMotion
                                            ? 0
                                            : 0.06 + index * 0.07,
                                        ease: [0.16, 1, 0.3, 1],
                                    }}
                                    whileTap={
                                        reduceMotion
                                            ? undefined
                                            : { scale: 0.985 }
                                    }
                                    onClick={() => {
                                        if (locked) {
                                            setLockedModule(module.id);
                                            return;
                                        }
                                        router.push(module.href);
                                    }}
                                    className={`group flex min-h-[22rem] flex-col rounded-2xl border border-stroke-soft-200 bg-white-0 p-6 text-left shadow-[0_1px_2px_rgba(14,18,27,0.04),0_8px_24px_-16px_rgba(14,18,27,0.08)] transition-[border-color,box-shadow,transform] duration-200 ${
                                        locked
                                            ? "hover:border-stroke-sub-300"
                                            : "hover:-translate-y-0.5 hover:border-blue-500/25 hover:shadow-[0_12px_32px_-16px_rgba(51,92,255,0.16)]"
                                    }`}
                                >
                                    <ModuleArt id={module.id} locked={locked} />
                                    <div className="mt-8 flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h2 className="text-2xl font-medium tracking-tight text-strong-950">
                                                {module.title}
                                            </h2>
                                            <p className="mt-1 text-label-xs text-sub-600">
                                                {module.keywords}
                                            </p>
                                        </div>
                                        <span
                                            className={`shrink-0 rounded-lg px-2.5 py-1 text-label-xs font-medium ${
                                                locked
                                                    ? "bg-weak-50 text-sub-600"
                                                    : gate.kind === "trial"
                                                      ? "bg-away-lighter text-away-dark"
                                                      : "bg-success-lighter text-success-dark"
                                            }`}
                                        >
                                            {moduleStatusLabel(gate)}
                                        </span>
                                    </div>
                                    <p className="mt-4 text-label-sm leading-relaxed text-sub-600">
                                        {module.description}
                                    </p>
                                    {locked ? (
                                        <p className="mt-auto pt-6 text-label-xs text-sub-600">
                                            {module.id === "chronology" ||
                                            module.id === "forensic"
                                                ? isCompanyAdmin
                                                    ? "Request Super Admin to unlock"
                                                    : "Request company admin for access"
                                                : "Upgrade to unlock this module"}
                                        </p>
                                    ) : (
                                        <p className="mt-auto pt-6 text-label-xs font-medium text-blue-500 opacity-0 transition-opacity group-hover:opacity-100">
                                            Open module →
                                        </p>
                                    )}
                                </motion.button>
                            );
                        })}
                    </div>
                </PageEnter>

                <UpgradePackageModal
                    open={Boolean(
                        lockedMeta && lockedGate?.state === "locked"
                    )}
                    moduleTitle={lockedMeta?.title ?? ""}
                    moduleId={lockedModule}
                    reason={
                        lockedGate?.state === "locked"
                            ? lockedGate.reason
                            : "addon"
                    }
                    isCompanyAdmin={Boolean(isCompanyAdmin)}
                    accessToken={session?.accessToken}
                    pendingRequest={Boolean(
                        lockedModule && pendingModules.has(lockedModule)
                    )}
                    onClose={() => {
                        setLockedModule(null);
                        router.replace("/workspace");
                    }}
                    onRequested={() => {
                        if (lockedModule) {
                            setPendingModules(
                                (prev) => new Set(prev).add(lockedModule)
                            );
                        }
                    }}
                />
            </div>
        </PortalRouteGate>
    );
};

const MODULE_MARK: Record<ModuleId, string> = {
    chatbot: "/images/modules/queris.png",
    chronology: "/images/modules/chronos.png",
    forensic: "/images/modules/forensis.png",
};

function ModuleArt({ id, locked }: { id: ModuleId; locked: boolean }) {
    return (
        <div
            className={`flex h-28 items-center justify-center ${locked ? "opacity-50" : ""}`}
        >
            <Image
                src={MODULE_MARK[id]}
                alt=""
                width={96}
                height={96}
                className="h-24 w-24 rounded-2xl object-contain"
            />
        </div>
    );
}

export default HubPage;
