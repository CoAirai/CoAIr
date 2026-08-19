"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { useLiveWorkspace } from "@/context/LiveWorkspaceContext";
import { planForCompany } from "@/lib/admin/plans";
import { companyForSession } from "@/lib/workspace/companyForSession";
import { getForensicTool } from "@/lib/forensic/nav";
import { getModuleGate } from "@/lib/workspace/moduleAccess";
import { ownedByUser } from "@/lib/workspace/ownedByUser";
import { useChat } from "@/context/ChatContext";
import ForensicShell from "./ForensicShell";
import { ModulePortalSkeleton } from "@/components/Skeleton/portals";
import {
    createForensicRun,
    defaultForensicRunParameters,
    listForensicRuns,
    listForensicWorkspaces,
    type CoairForensicRun,
    type CoairForensicWorkspace,
} from "@/lib/coair/forensic";
import type { ForensicProgrammeWorkspace } from "@/lib/forensic/types";

type Props = {
    toolId: string;
};

const FORENSIC_WORKSPACE_KEY = "coair.forensic.activeWorkspace";

function mapWorkspace(
    row: CoairForensicWorkspace,
    companyId: string
): ForensicProgrammeWorkspace {
    return {
        id: row.workspace_id,
        companyId,
        name: row.name,
        programmeIds: row.programme_ids ?? [],
        createdAt: row.created_at || new Date().toISOString(),
    };
}

function summarizeRun(run: CoairForensicRun | null) {
    if (!run) return "No live run yet.";
    if (run.status && !["ready", "complete", "completed"].includes(run.status)) {
        return `Status: ${run.status}${run.error ? ` — ${run.error}` : ""}`;
    }
    const result = run.result;
    if (!result) return "Run finished with no summary.";
    if (typeof result.summary === "string") return result.summary;
    if (typeof result.narrative === "string") return result.narrative;
    if (typeof result.text === "string") return result.text;
    if (Array.isArray(result.findings)) return result.findings.join(" ");
    return JSON.stringify(result).slice(0, 1200);
}

const ForensicToolPage = ({ toolId }: Props) => {
    const router = useRouter();
    const { session } = useAuth();
    const { companies, plans, companyWorkspaces, setActiveForensicWorkspace } =
        useAdminData();
    const live = useLiveWorkspace();
    const tool = getForensicTool(toolId);
    const { activeWorkspaceUserId } = useChat();
    const company = companyForSession(session, companies);
    const plan = planForCompany(company, plans);
    const gate =
        company && plan ? getModuleGate(plan, company, "forensic") : null;
    const workspaceState = company
        ? companyWorkspaces[company.id]
        : undefined;
    const mockWorkspaces = ownedByUser(
        workspaceState?.forensicProgrammeWorkspaces ?? [],
        activeWorkspaceUserId ?? session?.userId
    );
    const xerFiles = workspaceState?.forensicXerFiles ?? [];
    const [liveWorkspaces, setLiveWorkspaces] = useState<
        ForensicProgrammeWorkspace[]
    >([]);
    const [liveActiveId, setLiveActiveId] = useState("");
    const [run, setRun] = useState<CoairForensicRun | null>(null);
    const [runError, setRunError] = useState("");
    const [running, setRunning] = useState(false);

    const programmeWorkspaces = live.enabled ? liveWorkspaces : mockWorkspaces;
    const activeWorkspace =
        programmeWorkspaces.find((entry) =>
            live.enabled
                ? entry.id === liveActiveId
                : entry.id === workspaceState?.activeForensicWorkspaceId
        ) ?? null;
    const activeProgrammes = activeWorkspace
        ? xerFiles.filter((file) =>
              activeWorkspace.programmeIds.includes(file.id)
          )
        : [];
    const canLiveRun = Boolean(defaultForensicRunParameters(toolId));

    useEffect(() => {
        if (gate?.state === "locked") {
            router.replace("/workspace?upgrade=forensic");
        }
        if (!tool || tool.id === "intake") {
            router.replace("/workspace/forensic");
        }
    }, [gate, router, tool]);

    useEffect(() => {
        if (!live.enabled || !session?.accessToken || !session.projectId) {
            setLiveWorkspaces([]);
            return;
        }
        const token = session.accessToken;
        const projectId = session.projectId;
        const companyId = session.companyId ?? "live";
        let cancelled = false;
        void listForensicWorkspaces(token, projectId)
            .then((payload) => {
                if (cancelled) return;
                const mapped = (payload.workspaces ?? []).map((row) =>
                    mapWorkspace(row, companyId)
                );
                setLiveWorkspaces(mapped);
                const stored =
                    window.sessionStorage.getItem(FORENSIC_WORKSPACE_KEY) ?? "";
                setLiveActiveId(
                    mapped.some((entry) => entry.id === stored)
                        ? stored
                        : mapped[0]?.id ?? ""
                );
            })
            .catch((err) => {
                if (!cancelled) {
                    setRunError(
                        err instanceof Error
                            ? err.message
                            : "Unable to load workspaces"
                    );
                }
            });
        return () => {
            cancelled = true;
        };
    }, [live.enabled, session?.accessToken, session?.companyId, session?.projectId]);

    useEffect(() => {
        if (
            !live.enabled ||
            !session?.accessToken ||
            !session.projectId ||
            !liveActiveId ||
            !tool
        ) {
            setRun(null);
            return;
        }
        let cancelled = false;
        void listForensicRuns(session.accessToken, session.projectId, liveActiveId)
            .then((payload) => {
                if (cancelled) return;
                const latest =
                    (payload.runs ?? []).find(
                        (item) => item.module_slug === tool.id
                    ) ?? null;
                setRun(latest);
            })
            .catch(() => {
                if (!cancelled) setRun(null);
            });
        return () => {
            cancelled = true;
        };
    }, [
        live.enabled,
        liveActiveId,
        session?.accessToken,
        session?.projectId,
        tool,
    ]);

    const runLive = async () => {
        if (!session?.accessToken || !session.projectId || !liveActiveId || !tool) {
            return;
        }
        setRunning(true);
        setRunError("");
        try {
            const created = await createForensicRun(
                session.accessToken,
                session.projectId,
                liveActiveId,
                tool.id
            );
            setRun(created);
        } catch (err) {
            setRunError(err instanceof Error ? err.message : "Run failed");
        } finally {
            setRunning(false);
        }
    };

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
                                onChange={(event) => {
                                    const next = event.target.value;
                                    if (live.enabled) {
                                        setLiveActiveId(next);
                                        window.sessionStorage.setItem(
                                            FORENSIC_WORKSPACE_KEY,
                                            next
                                        );
                                        return;
                                    }
                                    setActiveForensicWorkspace(
                                        company.id,
                                        next || null
                                    );
                                }}
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
                                    {live.enabled
                                        ? `${activeWorkspace.programmeIds.length} programme(s)`
                                        : `${activeProgrammes.length} XER programme${
                                              activeProgrammes.length === 1
                                                  ? ""
                                                  : "s"
                                          }`}
                                </p>
                            </section>
                            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5 md:col-span-2">
                                <h2 className="text-label-xs uppercase tracking-[0.16em] text-soft-400">
                                    {live.enabled ? "Live engine" : "Mock finding"}
                                </h2>
                                <p className="mt-2 text-label-sm leading-6 text-sub-600">
                                    {live.enabled
                                        ? summarizeRun(run)
                                        : `${tool.label} ran against ${
                                              activeProgrammes
                                                  .map((file) => file.name)
                                                  .join(" · ") || "the selected set"
                                          }. This is a deterministic mock result for product review — live engine output comes later.`}
                                </p>
                                {runError ? (
                                    <p className="mt-3 text-label-sm text-red-500">
                                        {runError}
                                    </p>
                                ) : null}
                                {live.enabled ? (
                                    <button
                                        type="button"
                                        disabled={!canLiveRun || running}
                                        onClick={() => void runLive()}
                                        className="mt-4 h-10 rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 disabled:cursor-not-allowed disabled:bg-soft-200 disabled:text-soft-400"
                                    >
                                        {running
                                            ? "Running…"
                                            : canLiveRun
                                              ? `Run ${tool.label}`
                                              : "Needs extra inputs"}
                                    </button>
                                ) : null}
                            </section>
                            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5 md:col-span-3">
                                <h2 className="text-label-md text-strong-950">
                                    Result summary
                                </h2>
                                <p className="mt-3 text-label-sm leading-7 text-sub-600">
                                    {live.enabled
                                        ? "Open Intake to swap the XER set, then run this analysis against the live forensic engine."
                                        : `The selected programmes support a readable ${tool.label.toLowerCase()} position. Open Intake to swap the XER set, or keep this workspace and move through the native COAir analyses in the left nav.`}
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
