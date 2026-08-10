"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { getPlanById } from "@/lib/admin/plans";
import {
    canCreateProgrammeWorkspace,
    MAX_PROGRAMME_SET_MB,
    totalProgrammeSizeMb,
} from "@/lib/forensic/intake";
import { getModuleGate } from "@/lib/workspace/moduleAccess";
import { ownedByUser } from "@/lib/workspace/ownedByUser";
import { useChat } from "@/context/ChatContext";
import ForensicShell from "./ForensicShell";
import { ModulePortalSkeleton } from "@/components/Skeleton/portals";

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
    const company = companies.find((entry) => entry.id === session?.companyId);
    const plan = company ? getPlanById(company.planId, plans) : null;
    const gate =
        company && plan ? getModuleGate(plan, company, "forensic") : null;
    const workspaceState = company
        ? companyWorkspaces[company.id]
        : undefined;
    const xerFiles = workspaceState?.forensicXerFiles ?? [];
    const ownerUserId = activeWorkspaceUserId ?? session?.userId ?? undefined;
    const programmeWorkspaces = ownedByUser(
        workspaceState?.forensicProgrammeWorkspaces ?? [],
        ownerUserId
    );
    const activeWorkspaceId = programmeWorkspaces.some(
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

    const selectedFiles = useMemo(
        () => xerFiles.filter((file) => selectedIds.includes(file.id)),
        [selectedIds, xerFiles]
    );
    const selectedSize = totalProgrammeSizeMb(selectedFiles);
    const canCreate = canCreateProgrammeWorkspace(selectedFiles);

    if (!company || !plan || !gate || gate.state === "locked") {
        return <ModulePortalSkeleton />;
    }

    const onUpload = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
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

    const createWorkspace = () => {
        if (!canCreate) {
            setError(
                selectedFiles.length === 0
                    ? "Select at least one XER programme."
                    : `Combined selected size may not exceed ${MAX_PROGRAMME_SET_MB} MB.`
            );
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
