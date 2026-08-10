"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import Image from "@/components/Image";
import UpgradePackageModal from "@/components/Workspace/UpgradePackageModal";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { getPlanById } from "@/lib/admin/plans";
import type { ModuleId } from "@/lib/admin/types";
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
    const requested = searchParams.get("upgrade") as ModuleId | null;
    const [lockedModule, setLockedModule] = useState<ModuleId | null>(
        requested && MODULES.some((module) => module.id === requested)
            ? requested
            : null
    );

    const company = useMemo(
        () => companies.find((entry) => entry.id === session?.companyId) ?? null,
        [companies, session?.companyId]
    );
    const plan = company ? getPlanById(company.planId, plans) : null;
    const initials = (session?.name ?? "U")
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");

    if (!company || !plan) {
        return <WorkspaceHubSkeleton />;
    }

    const lockedMeta = lockedModule
        ? MODULES.find((module) => module.id === lockedModule)
        : null;
    const lockedGate = lockedModule
        ? getModuleGate(plan, company, lockedModule)
        : null;

    return (
        <PortalRouteGate skeleton={<WorkspaceHubSkeleton />}>
        <div className="min-h-screen bg-weak-50 text-strong-950">
            <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
                <div className="min-w-40">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-soft-400">
                        Active project
                    </p>
                    <p className="mt-1 truncate text-label-sm text-strong-950">
                        {company.name}
                    </p>
                </div>

                <Image
                    className="h-8 w-auto rounded-xl object-contain opacity-100"
                    src="/images/coair-logo.png"
                    width={120}
                    height={32}
                    alt="COAir"
                />

                <div className="flex min-w-40 items-center justify-end gap-3">
                    <span className="hidden text-[11px] uppercase tracking-[0.18em] text-soft-400 sm:block">
                        {plan.name}
                    </span>
                    <Menu as="div" className="relative">
                        <MenuButton
                            className="flex size-10 items-center justify-center rounded-xl border-2 border-stroke-soft-200 bg-white-0 text-label-sm font-medium text-strong-950 outline-0 hover:border-stroke-sub-300 hover:bg-soft-200"
                            aria-label="Open account menu"
                        >
                            {initials || "U"}
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
                                    <Link href="/company" className={menuItemClass}>
                                        Company admin
                                    </Link>
                                </MenuItem>
                            ) : null}
                            <MenuItem
                                as="button"
                                type="button"
                                className={menuItemClass}
                                onClick={() => {
                                    signOut();
                                    router.replace("/auth/sign-in");
                                }}
                            >
                                Sign out
                            </MenuItem>
                        </MenuItems>
                    </Menu>
                </div>
            </header>

            <main className="mx-auto max-w-6xl px-6 pb-16 pt-10">
                <p className="text-center text-[11px] uppercase tracking-[0.28em] text-soft-400">
                    Select · Module
                </p>
                <h1 className="mt-3 text-center text-4xl font-medium tracking-tight text-strong-950 max-md:text-3xl">
                    Where are you working?
                </h1>
                <p className="mx-auto mt-3 max-w-2xl text-center text-label-sm leading-6 text-sub-600">
                    Three ways into the same project record. The one you pick
                    opens with your session intact.
                </p>

                <div className="mt-5 flex justify-center">
                    <div className="inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-label-xs text-green-700 dark:text-green-300">
                        <span className="size-1.5 rounded-full bg-green-500" />
                        Active project · {company.name}
                    </div>
                </div>

                <div className="mt-12 grid gap-5 md:grid-cols-3">
                    {MODULES.map((module) => {
                        const gate = getModuleGate(plan, company, module.id);
                        const locked = gate.state === "locked";
                        return (
                            <button
                                key={module.id}
                                type="button"
                                onClick={() => {
                                    if (locked) {
                                        setLockedModule(module.id);
                                        return;
                                    }
                                    router.push(module.href);
                                }}
                                className={`group flex min-h-[22rem] flex-col rounded-[1.75rem] border p-6 text-left transition-all ${
                                    locked
                                        ? "border-stroke-soft-200 bg-white-0 hover:border-stroke-sub-300"
                                        : "border-stroke-soft-200 bg-white-0 hover:-translate-y-1 hover:border-stroke-sub-300 hover:shadow-xl"
                                }`}
                            >
                                <ModuleArt id={module.id} locked={locked} />
                                <div className="mt-8 flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-[11px] uppercase tracking-[0.22em] text-soft-400">
                                            {module.keywords}
                                        </p>
                                        <h2 className="mt-2 text-2xl font-medium text-strong-950">
                                            {module.title}
                                        </h2>
                                    </div>
                                    <span
                                        className={`shrink-0 rounded-md border px-2 py-1 text-[11px] uppercase tracking-wide ${
                                            locked
                                                ? "border-stroke-soft-200 text-sub-600"
                                                : gate.kind === "trial"
                                                  ? "border-away-base/40 text-away-dark dark:text-away-base"
                                                  : "border-green-500/40 text-green-700 dark:text-green-300"
                                        }`}
                                    >
                                        {moduleStatusLabel(gate)}
                                    </span>
                                </div>
                                <p className="mt-4 text-label-sm leading-6 text-sub-600">
                                    {module.description}
                                </p>
                                <p className="mt-auto pt-6 text-label-xs uppercase tracking-[0.18em] text-soft-400">
                                    Module {module.number}
                                    {locked ? " · Upgrade to open" : ""}
                                </p>
                            </button>
                        );
                    })}
                </div>
            </main>

            <UpgradePackageModal
                open={Boolean(lockedMeta && lockedGate?.state === "locked")}
                moduleTitle={lockedMeta?.title ?? ""}
                reason={
                    lockedGate?.state === "locked"
                        ? lockedGate.reason
                        : "addon"
                }
                isCompanyAdmin={session?.role === "company_admin"}
                onClose={() => {
                    setLockedModule(null);
                    router.replace("/workspace");
                }}
            />
        </div>
        </PortalRouteGate>
    );
};

function ModuleArt({ id, locked }: { id: ModuleId; locked: boolean }) {
    const muted = locked ? "opacity-50" : "opacity-100";

    if (id === "chatbot") {
        return (
            <div className={`relative h-28 ${muted}`}>
                <div className="absolute left-2 top-6 h-16 w-24 rounded-2xl bg-blue-500" />
                <div className="absolute left-16 top-0 h-16 w-24 rounded-2xl border border-stroke-soft-200 bg-white-0 shadow-sm" />
            </div>
        );
    }

    if (id === "chronology") {
        return (
            <div className={`relative h-28 ${muted}`}>
                <div className="absolute left-6 top-2 h-24 w-1 rounded-full bg-stroke-sub-300" />
                <div className="absolute left-4 top-4 h-5 w-16 rounded-full bg-soft-200" />
                <div className="absolute left-4 top-12 h-5 w-20 rounded-full bg-warning-base" />
                <div className="absolute left-4 top-20 h-5 w-14 rounded-full bg-soft-200" />
            </div>
        );
    }

    return (
        <div className={`relative h-28 ${muted}`}>
            <div className="absolute left-2 top-8 h-4 w-20 rounded-sm bg-blue-500" />
            <div className="absolute left-10 top-14 h-4 w-16 rounded-sm bg-blue-300" />
            <div className="absolute left-6 top-20 h-4 w-14 rounded-sm bg-warning-base" />
            <div className="absolute left-20 top-6 h-4 w-10 rounded-sm bg-green-500" />
            <div className="absolute bottom-2 left-24 top-2 border-l border-dashed border-stroke-sub-300" />
        </div>
    );
}

export default HubPage;
