"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { getPlanById } from "@/lib/admin/plans";
import { getForensicTool } from "@/lib/forensic/nav";
import { getModuleGate } from "@/lib/workspace/moduleAccess";
import { ownedByUser } from "@/lib/workspace/ownedByUser";
import { useChat } from "@/context/ChatContext";
import ForensicShell from "./ForensicShell";
import { ModulePortalSkeleton } from "@/components/Skeleton/portals";

type Props = {
    toolId: string;
};

const ForensicToolPage = ({ toolId }: Props) => {
    const router = useRouter();
    const { session } = useAuth();
    const { companies, plans, companyWorkspaces, setActiveForensicWorkspace } =
        useAdminData();
    const tool = getForensicTool(toolId);
    const { activeWorkspaceUserId } = useChat();
    const company = companies.find((entry) => entry.id === session?.companyId);
    const plan = company ? getPlanById(company.planId, plans) : null;
    const gate =
        company && plan ? getModuleGate(plan, company, "forensic") : null;
    const workspaceState = company
        ? companyWorkspaces[company.id]
        : undefined;
    const programmeWorkspaces = ownedByUser(
        workspaceState?.forensicProgrammeWorkspaces ?? [],
        activeWorkspaceUserId ?? session?.userId
    );
    const xerFiles = workspaceState?.forensicXerFiles ?? [];
    const activeWorkspace =
        programmeWorkspaces.find(
            (entry) => entry.id === workspaceState?.activeForensicWorkspaceId
        ) ?? null;
    const activeProgrammes = activeWorkspace
        ? xerFiles.filter((file) =>
              activeWorkspace.programmeIds.includes(file.id)
          )
        : [];

    useEffect(() => {
        if (gate?.state === "locked") {
            router.replace("/workspace?upgrade=forensic");
        }
        if (!tool || tool.id === "intake") {
            router.replace("/workspace/forensic");
        }
    }, [gate, router, tool]);

    if (!company || !plan || !gate || gate.state === "locked" || !tool) {
        return <ModulePortalSkeleton />;
    }

    return (
        <ForensicShell>
            <div className="chat-wrapper">
                <main className="min-h-0 flex-1 overflow-auto bg-weak-50/40 px-7.5 py-8 scrollbar-none max-md:px-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.22em] text-soft-400">
                                Programme / deterministic engine
                            </p>
                            <h1 className="mt-3 text-4xl font-medium tracking-tight text-strong-950 max-md:text-3xl">
                                {tool.label}
                            </h1>
                            <p className="mt-3 max-w-3xl text-label-sm leading-6 text-sub-600">
                                {tool.summary}
                            </p>
                        </div>
                        <label className="block min-w-56">
                            <span className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-soft-400">
                                Workspace
                            </span>
                            <select
                                className="h-11 w-full rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-label-sm text-strong-950 outline-none"
                                value={activeWorkspace?.id ?? ""}
                                onChange={(event) =>
                                    setActiveForensicWorkspace(
                                        company.id,
                                        event.target.value || null
                                    )
                                }
                            >
                                <option value="">No workspace selected</option>
                                {programmeWorkspaces.map((entry) => (
                                    <option key={entry.id} value={entry.id}>
                                        {entry.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    {!activeWorkspace ? (
                        <section className="mt-8 rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                            <h2 className="text-label-md text-strong-950">
                                Workspace required
                            </h2>
                            <p className="mt-2 text-label-sm leading-6 text-sub-600">
                                Create or select a programme workspace in Data
                                Intake before running {tool.label}.
                            </p>
                            <Link
                                href="/workspace/forensic"
                                className="mt-5 inline-flex h-11 items-center rounded-xl bg-blue-500 px-4 text-label-sm text-white-0"
                            >
                                Go to Intake
                            </Link>
                        </section>
                    ) : (
                        <div className="mt-8 grid gap-3 md:grid-cols-3">
                            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                                <h2 className="text-label-xs uppercase tracking-[0.16em] text-soft-400">
                                    Workspace
                                </h2>
                                <p className="mt-2 text-label-md text-strong-950">
                                    {activeWorkspace.name}
                                </p>
                                <p className="mt-2 text-label-xs text-sub-600">
                                    {activeProgrammes.length} XER programme
                                    {activeProgrammes.length === 1 ? "" : "s"}
                                </p>
                            </section>
                            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5 md:col-span-2">
                                <h2 className="text-label-xs uppercase tracking-[0.16em] text-soft-400">
                                    Mock finding
                                </h2>
                                <p className="mt-2 text-label-sm leading-6 text-sub-600">
                                    {tool.label} ran against{" "}
                                    {activeProgrammes
                                        .map((file) => file.name)
                                        .join(" · ") || "the selected set"}
                                    . This is a deterministic mock result for
                                    product review — live engine output comes
                                    later.
                                </p>
                            </section>
                            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5 md:col-span-3">
                                <h2 className="text-label-md text-strong-950">
                                    Result summary
                                </h2>
                                <p className="mt-3 text-label-sm leading-7 text-sub-600">
                                    The selected programmes support a readable{" "}
                                    {tool.label.toLowerCase()} position. Open
                                    Intake to swap the XER set, or keep this
                                    workspace and move through the native COAir
                                    analyses in the left nav.
                                </p>
                            </section>
                        </div>
                    )}
                </main>
            </div>
        </ForensicShell>
    );
};

export default ForensicToolPage;
