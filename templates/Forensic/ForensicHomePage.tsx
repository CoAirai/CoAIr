"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { planForCompany } from "@/lib/admin/plans";
import { companyForSession } from "@/lib/workspace/companyForSession";
import {
    canCreateProgrammeWorkspace,
    MAX_PROGRAMME_SET_MB,
    totalProgrammeSizeMb,
} from "@/lib/forensic/intake";
import { getModuleGate } from "@/lib/workspace/moduleAccess";
import { ownedByUser } from "@/lib/workspace/ownedByUser";
import { useChat } from "@/context/ChatContext";
import { useLiveWorkspace } from "@/context/LiveWorkspaceContext";
import ForensicShell from "./ForensicShell";
import { ModulePortalSkeleton } from "@/components/Skeleton/portals";
import {
    createForensicWorkspace,
    listForensicProgrammes,
    listForensicWorkspaces,
    uploadForensicProgramme,
    type CoairForensicWorkspace,
    type CoairProgramme,
} from "@/lib/coair/forensic";
import type { ForensicProgrammeWorkspace, ForensicXerFile } from "@/lib/forensic/types";

const FORENSIC_WORKSPACE_KEY = "coair.forensic.activeWorkspace";

function mapProgramme(row: CoairProgramme, companyId: string): ForensicXerFile {
    return {
        id: row.file_id,
        companyId,
        name: row.name,
        sizeMb: (row.size_bytes ?? 0) / 1_000_000,
        addedAt: row.created_at || new Date().toISOString(),
    };
}

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

const ForensicHomePage = () => {
    const router = useRouter();
    const xerInputRef = useRef<HTMLInputElement>(null);
    const { session } = useAuth();
    const {
        companies,
        plans,
        companyWorkspaces,
        addForensicXerFile,
        createForensicProgrammeWorkspace,
        setActiveForensicWorkspace,
    } = useAdminData();
    const { activeWorkspaceUserId } = useChat();
    const live = useLiveWorkspace();
    const company = companyForSession(session, companies);
    const plan = planForCompany(company, plans);
    const gate =
        company && plan ? getModuleGate(plan, company, "forensic") : null;
    const workspaceState = company
        ? companyWorkspaces[company.id]
        : undefined;
    const mockFiles = workspaceState?.forensicXerFiles ?? [];
    const ownerUserId = activeWorkspaceUserId ?? session?.userId ?? undefined;
    const mockWorkspaces = ownedByUser(
        workspaceState?.forensicProgrammeWorkspaces ?? [],
        ownerUserId
    );
    const [liveFiles, setLiveFiles] = useState<ForensicXerFile[]>([]);
    const [liveWorkspaces, setLiveWorkspaces] = useState<
        ForensicProgrammeWorkspace[]
    >([]);
    const [liveActiveId, setLiveActiveId] = useState("");
    const xerFiles = live.enabled ? liveFiles : mockFiles;
    const programmeWorkspaces = live.enabled ? liveWorkspaces : mockWorkspaces;
    const activeWorkspaceId = live.enabled
        ? liveActiveId
        : programmeWorkspaces.some(
              (entry) => entry.id === workspaceState?.activeForensicWorkspaceId
          )
          ? workspaceState?.activeForensicWorkspaceId ?? ""
          : "";

    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [workspaceName, setWorkspaceName] = useState("Programme Analysis");
    const [error, setError] = useState("");

    useEffect(() => {
        if (gate?.state === "locked") {
            router.replace("/workspace?upgrade=forensic");
        }
    }, [gate, router]);

    useEffect(() => {
        if (!live.enabled || !session?.accessToken || !session.projectId) {
            setLiveFiles([]);
            setLiveWorkspaces([]);
            return;
        }
        const token = session.accessToken;
        const projectId = session.projectId;
        const companyId = session.companyId ?? "live";
        let cancelled = false;
        void Promise.all([
            listForensicProgrammes(token, projectId),
            listForensicWorkspaces(token, projectId),
        ])
            .then(([programmes, workspaces]) => {
                if (cancelled) return;
                const files = (programmes.programmes ?? []).map((row) =>
                    mapProgramme(row, companyId)
                );
                const mapped = (workspaces.workspaces ?? []).map((row) =>
                    mapWorkspace(row, companyId)
                );
                setLiveFiles(files);
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
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Unable to load forensic programmes"
                    );
                }
            });
        return () => {
            cancelled = true;
        };
    }, [live.enabled, session?.accessToken, session?.companyId, session?.projectId]);

    const selectedFiles = useMemo(
        () => xerFiles.filter((file) => selectedIds.includes(file.id)),
        [selectedIds, xerFiles]
    );
    const selectedSize = totalProgrammeSizeMb(selectedFiles);
    const canCreate = canCreateProgrammeWorkspace(selectedFiles);

    if (!company || !plan || !gate || gate.state === "locked") {
        return <ModulePortalSkeleton />;
    }

    const onUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (live.enabled) {
            if (!session?.accessToken || !session.projectId) return;
            try {
                await uploadForensicProgramme(
                    session.accessToken,
                    session.projectId,
                    file
                );
                const listed = await listForensicProgrammes(
                    session.accessToken,
                    session.projectId
                );
                setLiveFiles(
                    (listed.programmes ?? []).map((row) =>
                        mapProgramme(row, session.companyId ?? "live")
                    )
                );
                setError("");
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "Upload failed"
                );
            }
            return;
        }
        const sizeMb = Math.max(0.1, file.size / (1024 * 1024));
        addForensicXerFile({
            companyId: company.id,
            name: file.name.toLowerCase().endsWith(".xer")
                ? file.name
                : `${file.name.replace(/\.[^.]+$/, "")}.xer`,
            sizeMb,
        });
    };

    const toggleFile = (id: string) => {
        setSelectedIds((current) =>
            current.includes(id)
                ? current.filter((entry) => entry !== id)
                : [...current, id]
        );
    };

    const createWorkspace = async () => {
        if (!canCreate) {
            setError(
                selectedFiles.length === 0
                    ? "Select at least one XER programme."
                    : `Combined selected size may not exceed ${MAX_PROGRAMME_SET_MB} MB.`
            );
            return;
        }
        if (live.enabled) {
            if (!session?.accessToken || !session.projectId) return;
            try {
                const created = await createForensicWorkspace(
                    session.accessToken,
                    session.projectId,
                    {
                        name: workspaceName,
                        programme_ids: selectedIds,
                    }
                );
                const mapped = mapWorkspace(
                    created,
                    session.companyId ?? "live"
                );
                setLiveWorkspaces((current) => [mapped, ...current]);
                setLiveActiveId(mapped.id);
                window.sessionStorage.setItem(FORENSIC_WORKSPACE_KEY, mapped.id);
                setSelectedIds([]);
                setError("");
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Could not create workspace."
                );
            }
            return;
        }
        const result = createForensicProgrammeWorkspace({
            companyId: company.id,
            ownerUserId,
            name: workspaceName,
            programmeIds: selectedIds,
        });
        if (!result.ok) {
            setError(result.error ?? "Could not create workspace.");
            return;
        }
        setError("");
        setSelectedIds([]);
    };

    return (
        <ForensicShell>
            <div className="chat-wrapper">
                <main className="min-h-0 flex-1 overflow-auto px-7.5 py-8 scrollbar-none max-md:px-4 max-md:py-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.22em] text-soft-400">
                                Programme / deterministic engine
                            </p>
                            <h1 className="mt-3 text-4xl font-medium tracking-tight text-strong-950 max-md:text-3xl">
                                Data Intake
                            </h1>
                        </div>
                        <label className="block min-w-56">
                            <span className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-soft-400">
                                Workspace
                            </span>
                            <select
                                className="h-11 w-full rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-label-sm text-strong-950 outline-none"
                                value={activeWorkspaceId}
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

                    <div className="mt-8 grid gap-4">
                        <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                            <h2 className="text-label-md text-strong-950">
                                Persistent programme sources
                            </h2>
                            <p className="mt-2 max-w-3xl text-label-sm leading-6 text-sub-600">
                                Primavera XER files remain inside this COAir
                                project, count toward source storage, and never
                                enter OCR, embeddings or document retrieval.
                            </p>
                            <input
                                ref={xerInputRef}
                                type="file"
                                accept=".xer,.txt,.xml,application/octet-stream"
                                className="hidden"
                                onChange={onUpload}
                            />
                            <button
                                type="button"
                                className="mt-5 h-11 rounded-xl border border-stroke-soft-200 bg-white-0 px-4 text-label-sm text-strong-950 hover:bg-weak-50"
                                onClick={() => xerInputRef.current?.click()}
                            >
                                Upload XER files
                            </button>
                        </section>

                        <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                            <h2 className="text-label-md text-strong-950">
                                Select the programme set
                            </h2>
                            <p className="mt-2 text-label-sm text-sub-600">
                                Combined selected size may not exceed{" "}
                                {MAX_PROGRAMME_SET_MB} MB.
                            </p>
                            {xerFiles.length === 0 ? (
                                <p className="mt-6 rounded-xl bg-weak-50 px-4 py-6 text-label-sm text-sub-600">
                                    No XER programmes are stored in this project.
                                </p>
                            ) : (
                                <div className="mt-4 divide-y divide-stroke-soft-200 border-t border-stroke-soft-200">
                                    {xerFiles.map((file) => (
                                        <label
                                            key={file.id}
                                            className="flex cursor-pointer items-center gap-3 py-3 text-label-sm"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(
                                                    file.id
                                                )}
                                                onChange={() => toggleFile(file.id)}
                                            />
                                            <span className="min-w-0 grow truncate text-strong-950">
                                                {file.name}
                                            </span>
                                            <span className="shrink-0 text-sub-600">
                                                {file.sizeMb.toFixed(1)} MB
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            )}
                            {error ? (
                                <p className="mt-3 text-label-sm text-red-500">
                                    {error}
                                </p>
                            ) : null}
                            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-weak-50 p-3">
                                <input
                                    value={workspaceName}
                                    onChange={(event) =>
                                        setWorkspaceName(event.target.value)
                                    }
                                    className="h-11 min-w-48 grow rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-label-sm text-strong-950 outline-none"
                                />
                                <span className="text-label-xs text-sub-600">
                                    {selectedSize.toFixed(1)} /{" "}
                                    {MAX_PROGRAMME_SET_MB} MB
                                </span>
                                <button
                                    type="button"
                                    disabled={!canCreate}
                                    onClick={createWorkspace}
                                    className="h-11 rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 disabled:cursor-not-allowed disabled:bg-soft-200 disabled:text-soft-400"
                                >
                                    Create workspace
                                </button>
                            </div>
                        </section>
                    </div>
                </main>
            </div>
        </ForensicShell>
    );
};

export default ForensicHomePage;
