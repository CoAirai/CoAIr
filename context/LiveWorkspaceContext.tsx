"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import type { CompanyDocument } from "@/lib/admin/companyDocuments";
import type { ModuleId } from "@/lib/admin/types";
import type { WorkspaceUser } from "@/lib/chat/threads";
import { mapLibraryDocuments } from "@/lib/coair/mapLibrary";
import {
    ensureSelfInWorkspaceUsers,
    mapLiveOrgUsersToWorkspaceUsers,
} from "@/lib/coair/mapWorkspaceUsers";
import {
    listOrgUsers,
    readAuthMe,
    readOrg,
    type CoairOrgUser,
} from "@/lib/coair/org";
import type { CoairProject } from "@/lib/coair/types";
import {
    deleteProjectFile,
    listIndexingStatus,
    listLibrary,
    listProjects,
    uploadProjectFile,
    type IndexingStatus,
} from "@/lib/coair/workspace";
import { addOnsFromModuleGrants } from "@/lib/workspace/companyForSession";

const INDEXING_DONE = new Set([
    "ready",
    "completed",
    "failed",
    "error",
    "credit_balance_exhausted",
]);

function stageLabel(status: string): string {
    const key = (status || "").toLowerCase();
    if (key === "queued") return "Queued";
    if (key === "extracting") return "Extracting";
    if (key === "ocr") return "OCR";
    if (key === "metadata") return "Metadata";
    if (key === "chunking") return "Chunking";
    if (key === "embedding") return "Embedding";
    if (key === "indexing") return "Indexing";
    if (key === "ready" || key === "completed") return "Ready";
    if (key === "failed" || key === "error") return "Failed";
    return status || "Processing";
}

type AccountUsage = {
    used_tokens?: number;
    token_limit?: number;
    credits_remaining?: number;
    credits_total?: number;
    storage_used_bytes?: number;
    storage_limit_bytes?: number;
    percent_remaining?: number;
};

type ModuleGrants = {
    chronology: boolean;
    forensic: boolean;
};

type FileTransfer = {
    id: string;
    fileId?: string;
    name: string;
    phase: "uploading" | "injecting" | "ready" | "failed";
    percent: number;
    stage?: string;
    error?: string;
};

type LiveWorkspaceValue = {
    enabled: boolean;
    loading: boolean;
    libraryLoading: boolean;
    error: string | null;
    projects: CoairProject[];
    documents: CompanyDocument[];
    accountUsage: AccountUsage | null;
    /** Live org members for company-admin workspace switcher. */
    teammates: WorkspaceUser[];
    orgUsers: CoairOrgUser[];
    moduleGrants: ModuleGrants;
    moduleAddOns: ModuleId[];
    /** In-flight uploads + indexing jobs for Knowledge Base progress UI. */
    fileTransfers: FileTransfer[];
    selectProject: (projectId: string) => void;
    uploadFile: (
        file: File,
        options?: { quiet?: boolean }
    ) => Promise<{ ok: boolean; error?: string }>;
    /** Upload many files in one picker action (parallel; progress per file). */
    uploadFiles: (
        files: File[]
    ) => Promise<{ ok: boolean; uploaded: number; failed: number; error?: string }>;
    removeFile: (fileId: string) => Promise<{ ok: boolean; error?: string }>;
    refresh: () => Promise<void>;
};

const EMPTY_GRANTS: ModuleGrants = { chronology: false, forensic: false };

function grantsFromSession(session: {
    moduleGrants?: { chronology?: boolean; forensic?: boolean };
} | null): ModuleGrants {
    if (!session?.moduleGrants) return EMPTY_GRANTS;
    return {
        chronology: Boolean(session.moduleGrants.chronology),
        forensic: Boolean(session.moduleGrants.forensic),
    };
}

function readBootstrap(): {
    projects: CoairProject[];
    accountUsage: AccountUsage | null;
} | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = sessionStorage.getItem("coair.live.bootstrap");
        if (!raw) return null;
        const parsed = JSON.parse(raw) as {
            projects?: CoairProject[];
            accountUsage?: AccountUsage | null;
        };
        return {
            projects: parsed.projects ?? [],
            accountUsage: parsed.accountUsage ?? null,
        };
    } catch {
        return null;
    }
}

const LiveWorkspaceContext = createContext<LiveWorkspaceValue | null>(null);

export function LiveWorkspaceProvider({ children }: { children: ReactNode }) {
    const { session, updateSession } = useAuth();
    const { pushToast } = useToast();
    const enabled = session?.source === "live" && Boolean(session.accessToken);
    const canListTeammates =
        enabled && session?.role === "company_admin" && Boolean(session.companyId);
    const [loading, setLoading] = useState(false);
    const [libraryLoading, setLibraryLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [projects, setProjects] = useState<CoairProject[]>(
        () => readBootstrap()?.projects ?? []
    );
    const [documents, setDocuments] = useState<CompanyDocument[]>([]);
    const [accountUsage, setAccountUsage] = useState<AccountUsage | null>(
        () => readBootstrap()?.accountUsage ?? null
    );
    const [orgUsers, setOrgUsers] = useState<CoairOrgUser[]>([]);
    const [moduleGrants, setModuleGrants] = useState<ModuleGrants>(() =>
        grantsFromSession(session)
    );
    const [fileTransfers, setFileTransfers] = useState<FileTransfer[]>([]);
    const lastProjectId = useRef<string | null | undefined>(undefined);
    const transferSeq = useRef(0);

    // After login, reuse the /projects payload already fetched for session seeding.
    useEffect(() => {
        if (!enabled) return;
        const boot = readBootstrap();
        if (!boot) return;
        setProjects((prev) => (prev.length > 0 ? prev : boot.projects));
        setAccountUsage((prev) => prev ?? boot.accountUsage);
    }, [enabled]);

    // Keep hub gates correct as soon as login seeds moduleGrants on the session.
    useEffect(() => {
        if (!enabled) {
            setModuleGrants(EMPTY_GRANTS);
            return;
        }
        if (session?.moduleGrants) {
            setModuleGrants(grantsFromSession(session));
        }
    }, [
        enabled,
        session?.moduleGrants?.chronology,
        session?.moduleGrants?.forensic,
    ]);

    const refreshCore = useCallback(async () => {
        if (!enabled || !session?.accessToken) {
            setProjects([]);
            setAccountUsage(null);
            setOrgUsers([]);
            setModuleGrants(EMPTY_GRANTS);
            setDocuments([]);
            lastProjectId.current = undefined;
            return;
        }
        const token = session.accessToken;
        setLoading(true);
        setError(null);
        try {
            const teammatesPromise = canListTeammates
                ? listOrgUsers(token).catch(() => ({ users: [] as CoairOrgUser[] }))
                : Promise.resolve({ users: [] as CoairOrgUser[] });

            const [listed, meResult, orgResult, teamResult] = await Promise.all([
                listProjects(token),
                readAuthMe(token).catch(() => null),
                readOrg(token).catch(() => null),
                teammatesPromise,
            ]);

            setProjects(listed.projects ?? []);
            setAccountUsage(listed.account_usage ?? null);

            if (meResult?.user?.features) {
                updateSession({ features: meResult.user.features });
            }

            if (orgResult) {
                const nextGrants = {
                    chronology: Boolean(orgResult.module_grants?.chronology),
                    forensic: Boolean(orgResult.module_grants?.forensic),
                };
                setModuleGrants(nextGrants);
                updateSession({ moduleGrants: nextGrants });
            }

            setOrgUsers(canListTeammates ? teamResult.users ?? [] : []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to load project");
        } finally {
            setLoading(false);
        }
    }, [
        canListTeammates,
        enabled,
        session?.accessToken,
        updateSession,
    ]);

    const refreshLibrary = useCallback(async () => {
        if (!enabled || !session?.accessToken || !session.projectId) {
            setDocuments([]);
            setLibraryLoading(false);
            return;
        }
        setLibraryLoading(true);
        try {
            const library = await listLibrary(
                session.accessToken,
                session.projectId
            );
            setDocuments(
                mapLibraryDocuments(library, session.companyId ?? "live")
            );
        } catch {
            setDocuments([]);
        } finally {
            setLibraryLoading(false);
        }
    }, [
        enabled,
        session?.accessToken,
        session?.companyId,
        session?.projectId,
    ]);

    const refresh = useCallback(async () => {
        await Promise.all([refreshCore(), refreshLibrary()]);
    }, [refreshCore, refreshLibrary]);

    useEffect(() => {
        void refreshCore();
    }, [refreshCore]);

    useEffect(() => {
        const projectId = session?.projectId ?? null;
        // Always load library when project is set; skip only duplicate same-id remounts.
        if (lastProjectId.current === projectId && lastProjectId.current !== undefined) {
            return;
        }
        lastProjectId.current = projectId;
        void refreshLibrary();
    }, [refreshLibrary, session?.projectId]);

    const selectProject = useCallback(
        (projectId: string) => {
            updateSession({ projectId });
        },
        [updateSession]
    );

    const applyIndexingJobs = useCallback(
        (jobs: IndexingStatus[]) => {
            const toasts: Array<{ message: string; tone: "success" | "error" }> =
                [];
            setFileTransfers((prev) => {
                if (!prev.length && !jobs.length) return prev;
                const byId = new Map(jobs.map((job) => [job.file_id, job]));
                const byName = new Map(
                    jobs.map((job) => [job.filename.toLowerCase(), job])
                );
                let changed = false;
                const next = prev.map((transfer) => {
                    const job =
                        (transfer.fileId && byId.get(transfer.fileId)) ||
                        byName.get(transfer.name.toLowerCase());
                    if (!job) return transfer;
                    const done = INDEXING_DONE.has(
                        (job.status || "").toLowerCase()
                    );
                    const failed =
                        job.status === "failed" ||
                        job.status === "error" ||
                        job.status === "credit_balance_exhausted";
                    const percent = Math.max(
                        transfer.percent,
                        Math.round(
                            Math.min(1, Math.max(0, job.progress || 0)) * 100
                        )
                    );
                    const updated: FileTransfer = {
                        ...transfer,
                        fileId: job.file_id || transfer.fileId,
                        phase: failed ? "failed" : done ? "ready" : "injecting",
                        percent: failed || done ? 100 : Math.max(percent, 5),
                        stage: stageLabel(job.status),
                        error: job.error || undefined,
                    };
                    if (
                        transfer.phase === "injecting" &&
                        updated.phase === "ready"
                    ) {
                        toasts.push({
                            message: `Injected ${transfer.name}`,
                            tone: "success",
                        });
                    }
                    if (
                        transfer.phase === "injecting" &&
                        updated.phase === "failed"
                    ) {
                        toasts.push({
                            message:
                                updated.error ||
                                `Failed to inject ${transfer.name}`,
                            tone: "error",
                        });
                    }
                    if (
                        updated.phase !== transfer.phase ||
                        updated.percent !== transfer.percent ||
                        updated.stage !== transfer.stage ||
                        updated.fileId !== transfer.fileId
                    ) {
                        changed = true;
                    }
                    return updated;
                });
                return changed ? next : prev;
            });
            for (const toast of toasts) {
                pushToast(toast.message, toast.tone);
            }
        },
        [pushToast]
    );

    // Poll indexing while any transfer is still uploading/injecting.
    const hasActiveTransfers = fileTransfers.some(
        (transfer) =>
            transfer.phase === "injecting" || transfer.phase === "uploading"
    );

    useEffect(() => {
        if (!enabled || !session?.accessToken || !session.projectId) return;
        if (!hasActiveTransfers) return;
        let cancelled = false;
        const token = session.accessToken;
        const projectId = session.projectId;

        const tick = async () => {
            try {
                const jobs = await listIndexingStatus(token, projectId);
                if (cancelled) return;
                applyIndexingJobs(jobs);
                const stillBusy = jobs.some(
                    (job) => !INDEXING_DONE.has((job.status || "").toLowerCase())
                );
                if (!stillBusy) {
                    await refreshLibrary();
                }
            } catch {
                /* keep polling */
            }
        };

        void tick();
        const timer = window.setInterval(() => {
            void tick();
        }, 2500);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [
        applyIndexingJobs,
        enabled,
        hasActiveTransfers,
        refreshLibrary,
        session?.accessToken,
        session?.projectId,
    ]);

    // Drop finished transfer chips after a short delay so the list stays tidy.
    useEffect(() => {
        const finished = fileTransfers.filter(
            (transfer) => transfer.phase === "ready" || transfer.phase === "failed"
        );
        if (!finished.length) return;
        const timer = window.setTimeout(() => {
            setFileTransfers((prev) =>
                prev.filter(
                    (transfer) =>
                        transfer.phase === "uploading" ||
                        transfer.phase === "injecting"
                )
            );
        }, 5000);
        return () => window.clearTimeout(timer);
    }, [fileTransfers]);

    const uploadFile = useCallback(
        async (file: File, options?: { quiet?: boolean }) => {
            const quiet = Boolean(options?.quiet);
            if (!session?.accessToken || !session.projectId) {
                return { ok: false, error: "No project selected" };
            }
            if (
                file.name.startsWith("._") ||
                file.name === ".DS_Store" ||
                file.name === "Thumbs.db"
            ) {
                const message =
                    "That file is macOS metadata (._…), not the real document. Upload the PDF without the ._ prefix.";
                if (!quiet) pushToast(message, "error");
                return { ok: false, error: message };
            }
            const transferId = `xfer-${Date.now()}-${++transferSeq.current}`;
            setFileTransfers((prev) => [
                {
                    id: transferId,
                    name: file.name,
                    phase: "uploading",
                    percent: 0,
                    stage: "Uploading",
                },
                ...prev,
            ]);
            if (!quiet) pushToast(`Uploading ${file.name}…`, "info");
            try {
                const result = await uploadProjectFile(
                    session.accessToken,
                    session.projectId,
                    file,
                    (percent) => {
                        setFileTransfers((prev) =>
                            prev.map((transfer) =>
                                transfer.id === transferId
                                    ? {
                                          ...transfer,
                                          percent,
                                          stage: `Uploading ${percent}%`,
                                      }
                                    : transfer
                            )
                        );
                    }
                );
                const fileId = result.file_id || "";
                const alreadyDone =
                    result.status === "completed" || result.status === "ready";
                setFileTransfers((prev) =>
                    prev.map((transfer) =>
                        transfer.id === transferId
                            ? {
                                  ...transfer,
                                  fileId: fileId || undefined,
                                  phase: alreadyDone ? "ready" : "injecting",
                                  percent: alreadyDone ? 100 : Math.max(transfer.percent, 100),
                                  stage: alreadyDone ? "Ready" : "Queued",
                              }
                            : transfer
                    )
                );
                await refreshLibrary();
                if (!quiet) {
                    pushToast(
                        alreadyDone
                            ? `Ready: ${file.name}`
                            : `Uploaded ${file.name} — injecting into AI…`,
                        "success"
                    );
                }
                return { ok: true };
            } catch (err) {
                const raw =
                    err instanceof Error ? err.message : "Upload failed";
                const message = raw
                    .replace(/^mac_sidecar:\s*/i, "")
                    .replace(/^invalid_pdf:\s*/i, "")
                    .replace(/^unsupported_file_type:\s*/i, "Unsupported file type: ");
                setFileTransfers((prev) =>
                    prev.map((transfer) =>
                        transfer.id === transferId
                            ? {
                                  ...transfer,
                                  phase: "failed",
                                  percent: 100,
                                  stage: "Failed",
                                  error: message,
                              }
                            : transfer
                    )
                );
                if (!quiet) pushToast(message, "error");
                return {
                    ok: false,
                    error: message,
                };
            }
        },
        [pushToast, refreshLibrary, session?.accessToken, session?.projectId]
    );

    const uploadFiles = useCallback(
        async (files: File[]) => {
            const list = files.filter(Boolean);
            if (list.length === 0) {
                return { ok: false, uploaded: 0, failed: 0, error: "No files selected" };
            }
            if (list.length === 1) {
                const result = await uploadFile(list[0]);
                return {
                    ok: result.ok,
                    uploaded: result.ok ? 1 : 0,
                    failed: result.ok ? 0 : 1,
                    error: result.error,
                };
            }
            pushToast(`Uploading ${list.length} documents…`, "info");
            const results = await Promise.all(
                list.map((file) => uploadFile(file, { quiet: true }))
            );
            const uploaded = results.filter((r) => r.ok).length;
            const failed = results.length - uploaded;
            if (failed === 0) {
                pushToast(
                    `Uploaded ${uploaded} documents — injecting into AI…`,
                    "success"
                );
            } else if (uploaded === 0) {
                pushToast(`All ${failed} uploads failed`, "error");
            } else {
                pushToast(
                    `Uploaded ${uploaded} of ${list.length}; ${failed} failed`,
                    "error"
                );
            }
            return {
                ok: failed === 0,
                uploaded,
                failed,
                error: failed ? `${failed} upload(s) failed` : undefined,
            };
        },
        [pushToast, uploadFile]
    );

    const removeFile = useCallback(
        async (fileId: string) => {
            if (!session?.accessToken || !session.projectId) {
                return { ok: false, error: "No project selected" };
            }
            try {
                await deleteProjectFile(
                    session.accessToken,
                    session.projectId,
                    fileId
                );
                await refreshLibrary();
                pushToast("Document removed", "info");
                return { ok: true };
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : "Delete failed";
                pushToast(message, "error");
                return {
                    ok: false,
                    error: message,
                };
            }
        },
        [pushToast, refreshLibrary, session?.accessToken, session?.projectId]
    );

    const teammates = useMemo(() => {
        if (!canListTeammates || !session?.companyId) return [];
        const mapped = mapLiveOrgUsersToWorkspaceUsers(
            orgUsers,
            session.companyId
        );
        return ensureSelfInWorkspaceUsers(mapped, {
            userId: session.userId ?? "",
            name: session.name ?? "",
            companyId: session.companyId,
        });
    }, [
        canListTeammates,
        orgUsers,
        session?.companyId,
        session?.name,
        session?.userId,
    ]);

    const moduleAddOns = useMemo(
        () => addOnsFromModuleGrants(moduleGrants),
        [moduleGrants]
    );

    const value = useMemo(
        () => ({
            enabled,
            loading,
            libraryLoading,
            error,
            projects,
            documents,
            accountUsage,
            teammates,
            orgUsers,
            moduleGrants,
            moduleAddOns,
            fileTransfers,
            selectProject,
            uploadFile,
            uploadFiles,
            removeFile,
            refresh,
        }),
        [
            accountUsage,
            documents,
            enabled,
            error,
            fileTransfers,
            libraryLoading,
            loading,
            moduleAddOns,
            moduleGrants,
            orgUsers,
            projects,
            refresh,
            removeFile,
            selectProject,
            teammates,
            uploadFile,
            uploadFiles,
        ]
    );

    return (
        <LiveWorkspaceContext.Provider value={value}>
            {children}
        </LiveWorkspaceContext.Provider>
    );
}

export function useLiveWorkspace() {
    const ctx = useContext(LiveWorkspaceContext);
    if (!ctx) {
        throw new Error("useLiveWorkspace must be used within LiveWorkspaceProvider");
    }
    return ctx;
}
