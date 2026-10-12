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
import {
    FORENSIC_MODULE_REQUIREMENTS,
    forensicRequirementCopy,
} from "@/lib/forensic/requirements";
import { ModulePortalSkeleton } from "@/components/Skeleton/portals";
import {
    createForensicRun,
    forensicRunParameters,
    listForensicProgrammes,
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

function isOpenRun(status?: string) {
    const value = (status || "").toLowerCase();
    return value === "queued" || value === "processing";
}

function statusClass(status?: string) {
    const value = (status || "").toUpperCase();
    if (value === "PASS") return "text-green-600";
    if (value === "FAIL") return "text-red-500";
    return "text-sub-600";
}

function forensicFailure(run: CoairForensicRun) {
    const code = run.error_code || run.error || "";
    if (code === "forensic_programmes_insufficient") {
        return "This check needs two programme files: one as-planned and one as-built. This workspace has only one XER, so the run stopped before any model was called. It is not a token limit.";
    }
    if (code === "token_quota_exceeded" || code.includes("quota")) {
        return "The account is over its CA usage limit, so this run could not continue.";
    }
    if (!code) return "Run failed.";
    return `Run failed — ${code.replaceAll("_", " ")}`;
}

function ForensicLiveResult({ run }: { run: CoairForensicRun | null }) {
    if (!run) {
        return (
            <p className="mt-2 text-label-sm leading-6 text-sub-600">
                No live run yet.
            </p>
        );
    }
    if (isOpenRun(run.status)) {
        return (
            <p className="mt-2 text-label-sm leading-6 text-sub-600">
                Status: {run.status}. You can close this page. The run
                continues, and coming back shows running, ready, or failed.
            </p>
        );
    }
    if ((run.status || "").toLowerCase() === "failed") {
        return (
            <p className="mt-2 text-label-sm leading-6 text-red-500">
                {forensicFailure(run)}
            </p>
        );
    }
    const result = run.result;
    const checks =
        result?.tables?.flatMap((table) => table.rows ?? []) ?? [];
    if (!result || (checks.length === 0 && !(result.metrics ?? []).length)) {
        const fallback =
            result?.summary ||
            result?.narrative ||
            result?.text ||
            (Array.isArray(result?.findings) ? result.findings.join(" ") : "");
        return (
            <p className="mt-2 text-label-sm leading-6 text-sub-600">
                {fallback || "Run finished with no summary."}
            </p>
        );
    }
    return (
        <div className="mt-3 flex flex-col gap-4">
            {(result.metrics ?? []).length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {result.metrics?.map((metric) => (
                        <span
                            key={`${metric.label}-${metric.value}`}
                            className="rounded-full border border-stroke-soft-200 px-3 py-1 text-label-xs text-sub-600"
                        >
                            {metric.label}: {metric.value}
                        </span>
                    ))}
                </div>
            ) : null}
            {checks.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-label-sm">
                        <thead>
                            <tr className="text-label-xs uppercase tracking-[0.14em] text-soft-400">
                                <th className="py-2 pr-3 font-medium">Check</th>
                                <th className="py-2 pr-3 font-medium">Status</th>
                                <th className="py-2 pr-3 font-medium">Result</th>
                                <th className="py-2 font-medium">Threshold</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {checks.map((row) => (
                                <tr key={`${row.number}-${row.name}`}>
                                    <td className="py-3 pr-3 text-strong-950">
                                        {row.number}. {row.name}
                                        {row.summary ? (
                                            <p className="mt-1 text-label-xs leading-5 text-sub-600">
                                                {row.summary}
                                            </p>
                                        ) : null}
                                    </td>
                                    <td
                                        className={`py-3 pr-3 ${statusClass(row.status)}`}
                                    >
                                        {row.status || "—"}
                                    </td>
                                    <td className="py-3 pr-3 text-sub-600">
                                        {row.metric_value ?? "—"}
                                    </td>
                                    <td className="py-3 text-sub-600">
                                        {row.threshold || row.na_reason || "—"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : null}
        </div>
    );
}

const ForensicToolPage = ({ toolId }: Props) => {
    const router = useRouter();
    const { session } = useAuth();
    const { companies, plans, companyWorkspaces, setActiveForensicWorkspace } =
        useAdminData();
    const live = useLiveWorkspace();
    const tool = getForensicTool(toolId);
    const { activeWorkspaceUserId } = useChat();
    const company = companyForSession(session, companies, {
        addOns: live.enabled ? live.moduleAddOns : undefined,
    });
    const plan = planForCompany(company, plans);
    const gate =
        company && plan
            ? getModuleGate(plan, company, "forensic", {
                  features: session?.features,
                  role: session?.role,
              })
            : null;
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
    const [programmeNames, setProgrammeNames] = useState<Record<string, string>>(
        {}
    );
    const [delayActivity, setDelayActivity] = useState("");
    const [delayStart, setDelayStart] = useState("");
    const [delayFinish, setDelayFinish] = useState("");
    const [cabCodes, setCabCodes] = useState("");
    const [cabAnchor, setCabAnchor] = useState("");

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
    const runParameters = tool
        ? forensicRunParameters(tool.id, {
              activity: delayActivity,
              start: delayStart,
              finish: delayFinish,
              activityCodes: cabCodes,
              anchor: cabAnchor,
          })
        : null;
    const canLiveRun = Boolean(runParameters);
    const programmeCount = live.enabled
        ? (activeWorkspace?.programmeIds.length ?? 0)
        : activeProgrammes.length;
    const requirement = FORENSIC_MODULE_REQUIREMENTS[toolId];
    const shortOnFiles = Boolean(
        requirement && !requirement.extra && programmeCount < requirement.files
    );
    const runBusy = running || isOpenRun(run?.status);

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
        void listForensicProgrammes(token, projectId)
            .then((payload) => {
                if (cancelled) return;
                const names: Record<string, string> = {};
                for (const row of payload.programmes ?? []) {
                    names[row.file_id] = row.name;
                }
                setProgrammeNames(names);
            })
            .catch(() => undefined);
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

    useEffect(() => {
        if (
            !live.enabled ||
            !session?.accessToken ||
            !session.projectId ||
            !liveActiveId ||
            !tool ||
            !isOpenRun(run?.status)
        ) {
            return;
        }
        const token = session.accessToken;
        const projectId = session.projectId;
        const moduleSlug = tool.id;
        let cancelled = false;
        const timer = window.setInterval(() => {
            void listForensicRuns(token, projectId, liveActiveId)
                .then((payload) => {
                    if (cancelled) return;
                    const latest =
                        (payload.runs ?? []).find(
                            (item) => item.module_slug === moduleSlug
                        ) ?? null;
                    if (latest) setRun(latest);
                })
                .catch(() => undefined);
        }, 2000);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [
        live.enabled,
        liveActiveId,
        run?.status,
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
                tool.id,
                forensicRunParameters(tool.id, {
                    activity: delayActivity,
                    start: delayStart,
                    finish: delayFinish,
                    activityCodes: cabCodes,
                    anchor: cabAnchor,
                })
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
                                Programme analysis
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
                    <p className="mt-4 text-label-sm text-sub-600">
                        {forensicRequirementCopy(tool.id, programmeCount)}
                    </p>

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
                                    {programmeCount === 1
                                        ? "1 programme file"
                                        : `${programmeCount} programme files`}
                                </p>
                                <ul className="mt-2 space-y-1">
                                    {(live.enabled
                                        ? activeWorkspace.programmeIds.map(
                                              (id) => programmeNames[id] || id
                                          )
                                        : activeProgrammes.map((file) => file.name)
                                    ).map((name, index) => (
                                        <li
                                            key={`${name}-${index}`}
                                            className="truncate text-label-xs text-strong-950"
                                        >
                                            {name}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5 md:col-span-2">
                                <h2 className="text-label-xs uppercase tracking-[0.16em] text-soft-400">
                                    {live.enabled ? "Live engine" : "Mock finding"}
                                </h2>
                                {live.enabled ? (
                                    <ForensicLiveResult run={run} />
                                ) : (
                                    <p className="mt-2 text-label-sm leading-6 text-sub-600">
                                        {`${tool.label} ran against ${
                                            activeProgrammes
                                                .map((file) => file.name)
                                                .join(" · ") || "the selected set"
                                        }. This is a deterministic mock result for product review — live engine output comes later.`}
                                    </p>
                                )}
                                {runError ? (
                                    <p className="mt-3 text-label-sm text-red-500">
                                        {runError}
                                    </p>
                                ) : null}
                                {live.enabled &&
                                (tool.id === "impacted-as-planned" ||
                                    tool.id === "time-impact-analysis") ? (
                                    <div className="mt-4 grid gap-3">
                                        <label className="block">
                                            <span className="mb-1 block text-label-xs text-sub-600">
                                                Delayed activity
                                            </span>
                                            <input
                                                value={delayActivity}
                                                onChange={(event) =>
                                                    setDelayActivity(event.target.value)
                                                }
                                                className="h-11 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm text-strong-950 outline-none focus:border-blue-500"
                                            />
                                        </label>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <label className="block">
                                                <span className="mb-1 block text-label-xs text-sub-600">
                                                    Start
                                                </span>
                                                <input
                                                    type="date"
                                                    value={delayStart}
                                                    max={delayFinish || undefined}
                                                    onChange={(event) =>
                                                        setDelayStart(event.target.value)
                                                    }
                                                    className="h-11 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm text-strong-950 outline-none focus:border-blue-500"
                                                />
                                            </label>
                                            <label className="block">
                                                <span className="mb-1 block text-label-xs text-sub-600">
                                                    Finish
                                                </span>
                                                <input
                                                    type="date"
                                                    value={delayFinish}
                                                    min={delayStart || undefined}
                                                    onChange={(event) =>
                                                        setDelayFinish(event.target.value)
                                                    }
                                                    className="h-11 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm text-strong-950 outline-none focus:border-blue-500"
                                                />
                                            </label>
                                        </div>
                                    </div>
                                ) : null}
                                {live.enabled && tool.id === "collapsed-as-built" ? (
                                    <div className="mt-4 grid gap-3">
                                        <label className="block">
                                            <span className="mb-1 block text-label-xs text-sub-600">
                                                Activity codes to remove
                                            </span>
                                            <textarea
                                                value={cabCodes}
                                                onChange={(event) =>
                                                    setCabCodes(event.target.value)
                                                }
                                                rows={3}
                                                placeholder="A1010, A1040"
                                                className="w-full rounded-xl border border-stroke-soft-200 px-3 py-2 text-label-sm text-strong-950 outline-none placeholder:text-soft-400 focus:border-blue-500"
                                            />
                                        </label>
                                        <label className="block">
                                            <span className="mb-1 block text-label-xs text-sub-600">
                                                Anchor activity (optional)
                                            </span>
                                            <input
                                                value={cabAnchor}
                                                onChange={(event) =>
                                                    setCabAnchor(event.target.value)
                                                }
                                                className="h-11 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm text-strong-950 outline-none focus:border-blue-500"
                                            />
                                        </label>
                                    </div>
                                ) : null}
                                {live.enabled && tool.id !== "report-assembler" ? (
                                    <button
                                        type="button"
                                        disabled={!canLiveRun || runBusy || shortOnFiles}
                                        onClick={() => void runLive()}
                                        className="mt-4 h-10 rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 disabled:cursor-not-allowed disabled:bg-soft-200 disabled:text-soft-400"
                                    >
                                        {runBusy
                                            ? "Running…"
                                            : !canLiveRun
                                              ? "Needs extra inputs"
                                              : shortOnFiles
                                                ? "Needs another programme"
                                                : `Run ${tool.label}`}
                                    </button>
                                ) : null}
                                {live.enabled && tool.id === "report-assembler" ? (
                                    <p className="mt-3 text-label-xs leading-5 text-sub-600">
                                        A downloadable claim report is not
                                        available from this page yet. Run the
                                        other checks in this workspace first.
                                    </p>
                                ) : null}
                                {live.enabled && !canLiveRun ? (
                                    <p className="mt-3 text-label-xs leading-5 text-sub-600">
                                        {tool.id === "evidence-led-draft"
                                            ? "This draft is not available from the engine yet."
                                            : tool.id === "collapsed-as-built"
                                              ? "Enter the activity codes to remove from the as-built programme."
                                              : tool.id === "impacted-as-planned" ||
                                                  tool.id === "time-impact-analysis"
                                                ? "Enter the delayed activity and a finish on or after the start."
                                                : requirement?.extra ||
                                                  "This analysis needs dates or a baseline that are not on the programme yet. Check the XER set in Data Intake."}
                                    </p>
                                ) : null}
                            </section>
                            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5 md:col-span-3">
                                <h2 className="text-label-md text-strong-950">
                                    Result summary
                                </h2>
                                <p className="mt-3 text-label-sm leading-7 text-sub-600">
                                    {live.enabled
                                        ? run
                                            ? "The checks above are the live engine result for this workspace. Run again after you change the XER set."
                                            : "No run yet. The result appears here after you run this analysis."
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
