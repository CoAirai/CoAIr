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
import { CoairApiError } from "@/lib/coair/client";
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
    downloadProjectFile,
    listIndexingStatus,
    listLibrary,
    createProject as createProjectRequest,
    deleteProject as deleteProjectRequest,
    renameProject as renameProjectRequest,
    listProjects,
    pinProjectFile,
    readIndexingSummary,
    reindexProjectFile,
    uploadProjectFile,
    type IndexingStatus,
} from "@/lib/coair/workspace";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
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
    batchTotal?: number;
};

const transferStorageKey = (projectId: string) =>
    `coair.upload.preview.${projectId}`;

function readSavedTransfers(projectId: string): FileTransfer[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.sessionStorage.getItem(transferStorageKey(projectId));
        if (!raw) return [];
        const parsed = JSON.parse(raw) as FileTransfer[];
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((transfer) => transfer && typeof transfer.id === "string")
            .map((transfer) =>
                transfer.phase === "uploading"
                    ? {
                          ...transfer,
                          phase: "injecting" as const,
                          stage: transfer.batchTotal
                              ? `${transfer.stage || "Upload in progress"}. Refresh stopped files that had not finished; the rest keep indexing.`
                              : "Refresh stopped this upload before it finished.",
                      }
                    : transfer
            );
    } catch {
        return [];
    }
}

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
    createProject: (name: string) => Promise<{ ok: boolean; error?: string }>;
    renameProject: (
        projectId: string,
        name: string
    ) => Promise<{ ok: boolean; error?: string }>;
    deleteProject: (projectId: string) => Promise<{ ok: boolean; error?: string }>;
    uploadFile: (
        file: File,
        options?: { quiet?: boolean }
    ) => Promise<{ ok: boolean; error?: string }>;
    /** Upload many files in one picker action (parallel; progress per file). */
    uploadFiles: (
        files: File[]
    ) => Promise<{ ok: boolean; uploaded: number; failed: number; error?: string }>;
    removeFile: (fileId: string) => Promise<{ ok: boolean; error?: string }>;
    reinjectFile: (fileId: string) => Promise<{ ok: boolean; error?: string }>;
    pinFile: (
        fileId: string,
        pinned: boolean
    ) => Promise<{ ok: boolean; error?: string }>;
    downloadFile: (
        fileId: string,
        fileName: string
    ) => Promise<{ ok: boolean; error?: string }>;
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
    const accessTokenRef = useRef(session?.accessToken ?? "");
    const tokenRefreshRef = useRef<Promise<string | null> | null>(null);
    const lastTokenRefreshAt = useRef(0);
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
    const hydratedProject = useRef<string | null>(null);
    const lastProjectId = useRef<string | null | undefined>(undefined);
    const transferSeq = useRef(0);
    const lastLibrarySync = useRef(0);
    const libraryRefreshInFlight = useRef(false);

    useEffect(() => {
        accessTokenRef.current = session?.accessToken ?? "";
    }, [session?.accessToken]);

    useEffect(() => {
        const projectId = session?.projectId;
        if (!projectId || hydratedProject.current === projectId) return;
        hydratedProject.current = projectId;
        setFileTransfers(readSavedTransfers(projectId));
    }, [session?.projectId]);

    useEffect(() => {
        const projectId = session?.projectId;
        if (!projectId || hydratedProject.current !== projectId) return;
        const active = fileTransfers.filter(
            (transfer) =>
                transfer.phase === "uploading" || transfer.phase === "injecting"
        );
        try {
            if (!active.length) {
                window.sessionStorage.removeItem(transferStorageKey(projectId));
                return;
            }
            window.sessionStorage.setItem(
                transferStorageKey(projectId),
                JSON.stringify(active)
            );
        } catch {
            /* the preview still works in this tab */
        }
    }, [fileTransfers, session?.projectId]);

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

    const refreshLibrary = useCallback(async (options?: { silent?: boolean }) => {
        if (!enabled || !session?.accessToken || !session.projectId) {
            setDocuments([]);
            setLibraryLoading(false);
            return;
        }
        if (options?.silent && libraryRefreshInFlight.current) return;
        libraryRefreshInFlight.current = true;
        if (!options?.silent) setLibraryLoading(true);
        try {
            const library = await listLibrary(
                session.accessToken,
                session.projectId
            );
            setDocuments(
                mapLibraryDocuments(library, session.companyId ?? "live")
            );
        } catch {
            if (!options?.silent) setDocuments([]);
        } finally {
            libraryRefreshInFlight.current = false;
            if (!options?.silent) setLibraryLoading(false);
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
        if (!enabled || !session?.accessToken) return;
        const token = session.accessToken;
        let cancelled = false;
        const pullBalance = () => {
            void readAuthMe(token)
                .then((me) => {
                    if (cancelled || !me.user) return;
                    const used = me.user.used_tokens ?? 0;
                    const limit = me.user.token_limit ?? 0;
                    const username = me.user.username;
                    setAccountUsage((current) => ({
                        ...(current ?? {}),
                        used_tokens: used,
                        token_limit: limit,
                        percent_remaining: me.user.percent_remaining,
                        credits_remaining: me.user.credits_remaining,
                        credits_total: me.user.credits_total,
                        storage_used_bytes: me.user.storage_used_bytes,
                        storage_limit_bytes: me.user.storage_limit_bytes,
                    }));
                    if (!username) return;
                    setOrgUsers((current) =>
                        current.map((user) =>
                            user.username === username
                                ? {
                                      ...user,
                                      used_tokens: used,
                                      token_limit: limit || user.token_limit,
                                  }
                                : user
                        )
                    );
                })
                .catch(() => undefined);
        };
        pullBalance();
        const timer = window.setInterval(pullBalance, 30000);
        const onFocus = () => {
            if (document.visibilityState === "visible") pullBalance();
        };
        document.addEventListener("visibilitychange", onFocus);
        window.addEventListener("focus", onFocus);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", onFocus);
            window.removeEventListener("focus", onFocus);
        };
    }, [enabled, session?.accessToken]);

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

    const createProject = useCallback(
        async (name: string) => {
            const trimmed = name.trim();
            if (!session?.accessToken) {
                return { ok: false, error: "Not signed in" };
            }
            if (!trimmed) {
                return { ok: false, error: "Project name required" };
            }
            try {
                const created = await createProjectRequest(
                    session.accessToken,
                    trimmed
                );
                setProjects((current) => [
                    created,
                    ...current.filter(
                        (project) => project.project_id !== created.project_id
                    ),
                ]);
                updateSession({ projectId: created.project_id });
                pushToast(`Created ${created.name}`, "info");
                return { ok: true };
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : "Could not create project";
                pushToast(message, "error");
                return { ok: false, error: message };
            }
        },
        [pushToast, session?.accessToken, updateSession]
    );

    const renameProject = useCallback(
        async (projectId: string, name: string) => {
            const trimmed = name.trim();
            if (!session?.accessToken) {
                return { ok: false, error: "Not signed in" };
            }
            if (!trimmed) {
                return { ok: false, error: "Project name required" };
            }
            try {
                const updated = await renameProjectRequest(
                    session.accessToken,
                    projectId,
                    trimmed
                );
                setProjects((current) =>
                    current.map((project) =>
                        project.project_id === projectId
                            ? { ...project, name: updated.name }
                            : project
                    )
                );
                pushToast(`Renamed to ${updated.name}`, "info");
                return { ok: true };
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : "Could not rename project";
                pushToast(message, "error");
                return { ok: false, error: message };
            }
        },
        [pushToast, session?.accessToken]
    );

    const deleteProject = useCallback(
        async (projectId: string) => {
            if (!session?.accessToken) {
                return { ok: false, error: "Not signed in" };
            }
            try {
                await deleteProjectRequest(session.accessToken, projectId);
                const remaining = projects.filter(
                    (project) => project.project_id !== projectId
                );
                setProjects(remaining);
                if (session.projectId === projectId) {
                    updateSession({
                        projectId: remaining[0]?.project_id ?? null,
                    });
                }
                pushToast("Project deleted", "info");
                return { ok: true };
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : "Could not delete project";
                pushToast(message, "error");
                return { ok: false, error: message };
            }
        },
        [projects, pushToast, session?.accessToken, session?.projectId, updateSession]
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
                                updated.error &&
                                updated.error.toLowerCase() !== "unknown error"
                                    ? `Failed to inject ${transfer.name}: ${updated.error}`
                                    : `Failed to inject ${transfer.name}`,
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

    // The upload chip lives in this tab. After a refresh, rebuild it from the
    // server queue so indexing progress stays visible.
    useEffect(() => {
        if (!enabled || !session?.accessToken || !session.projectId) return;
        let cancelled = false;
        const token = session.accessToken;
        const projectId = session.projectId;
        const restore = async () => {
            try {
                const summary = await readIndexingSummary(token, projectId);
                if (cancelled) return;
                const queued = summary.queued ?? 0;
                const processing = summary.processing ?? 0;
                const ready = summary.ready ?? 0;
                const failed = summary.failed ?? 0;
                const remaining = queued + processing;
                if (remaining <= 0) return;
                const done = ready + failed;
                const total = Math.max(1, done + remaining);
                const percent = Math.min(100, Math.round((done / total) * 100));
                const stage = `Indexing ${done.toLocaleString()} of ${total.toLocaleString()}`;
                setFileTransfers((prev) => {
                    const existing = prev.find(
                        (transfer) =>
                            transfer.batchTotal || transfer.id === "server-index"
                    );
                    if (!existing) {
                        return [
                            {
                                id: "server-index",
                                name: "Indexing documents",
                                phase: "injecting",
                                percent,
                                stage,
                                batchTotal: total,
                            },
                            ...prev,
                        ];
                    }
                    if (existing.phase === "uploading") return prev;
                    return prev.map((transfer) =>
                        transfer.id === existing.id
                            ? {
                                  ...transfer,
                                  phase: "injecting",
                                  percent,
                                  stage: transfer.stage?.includes("Refresh stopped")
                                      ? `${stage}. Refresh stopped files that had not finished.`
                                      : stage,
                                  batchTotal: Math.max(transfer.batchTotal ?? 0, total),
                              }
                            : transfer
                    );
                });
            } catch {
                /* retry on the interval */
            }
        };
        const timer = window.setInterval(() => {
            void restore();
        }, 8000);
        void restore();
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [enabled, session?.accessToken, session?.projectId]);

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
                const batch = fileTransfers.find((transfer) => transfer.batchTotal);
                if (batch && (batch.phase === "injecting" || batch.phase === "uploading")) {
                    if (batch.phase === "uploading") return;
                    const summary = await readIndexingSummary(token, projectId);
                    if (cancelled) return;
                    const queued = summary.queued ?? 0;
                    const processing = summary.processing ?? 0;
                    const ready = summary.ready ?? 0;
                    const failed = summary.failed ?? 0;
                    const remaining = queued + processing;
                    const done = ready + failed;
                    const total = Math.max(batch.batchTotal ?? 0, done + remaining);
                    setFileTransfers((prev) =>
                        prev.map((transfer) =>
                            transfer.id === batch.id
                                ? {
                                      ...transfer,
                                      phase: remaining === 0 && done > 0 ? "ready" : "injecting",
                                      percent:
                                          total > 0
                                              ? Math.min(100, Math.round((done / total) * 100))
                                              : transfer.percent,
                                      stage:
                                          remaining === 0
                                              ? "Ready for the demo"
                                              : transfer.stage?.includes("Refresh stopped")
                                                ? `Indexing ${done.toLocaleString()} of ${total.toLocaleString()}. Refresh stopped files that had not finished.`
                                                : `Indexing ${done.toLocaleString()} of ${total.toLocaleString()}`,
                                  }
                                : transfer
                        )
                    );
                    if (remaining === 0 && done > 0) {
                        await refreshLibrary();
                    } else if (Date.now() - lastLibrarySync.current > 20000) {
                        lastLibrarySync.current = Date.now();
                        void refreshLibrary({ silent: true });
                    }
                    return;
                }
                const jobs = await listIndexingStatus(token, projectId);
                if (cancelled) return;
                applyIndexingJobs(jobs);
                const activeNames = new Set(
                    fileTransfers
                        .filter(
                            (t) =>
                                t.phase === "injecting" || t.phase === "uploading"
                        )
                        .map((t) => t.name.toLowerCase())
                );
                const activeIds = new Set(
                    fileTransfers
                        .map((t) => t.fileId)
                        .filter(Boolean) as string[]
                );
                const watched = jobs.filter(
                    (job) =>
                        activeIds.has(job.file_id) ||
                        activeNames.has((job.filename || "").toLowerCase())
                );
                const stillBusy =
                    watched.length === 0
                        ? false
                        : watched.some(
                              (job) =>
                                  !INDEXING_DONE.has(
                                      (job.status || "").toLowerCase()
                                  )
                          );
                if (!stillBusy) {
                    await refreshLibrary();
                } else if (Date.now() - lastLibrarySync.current > 20000) {
                    lastLibrarySync.current = Date.now();
                    void refreshLibrary({ silent: true });
                }
            } catch {
                /* keep polling */
            }
        };

        void tick();
        const timer = window.setInterval(() => {
            void tick();
        }, fileTransfers.some((transfer) => transfer.batchTotal) ? 8000 : 2500);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [
        applyIndexingJobs,
        enabled,
        fileTransfers,
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

    const refreshUploadAccess = useCallback(async (): Promise<string | null> => {
        if (tokenRefreshRef.current) return tokenRefreshRef.current;
        const run = (async () => {
            try {
                const supabase = getSupabaseBrowser();
                if (!supabase) return accessTokenRef.current || null;
                const { data, error } = await supabase.auth.refreshSession();
                const next = data.session?.access_token?.trim() || "";
                if (error || !next) {
                    lastTokenRefreshAt.current = Date.now();
                    return accessTokenRef.current || null;
                }
                accessTokenRef.current = next;
                lastTokenRefreshAt.current = Date.now();
                updateSession({ accessToken: next });
                return next;
            } catch {
                return accessTokenRef.current || null;
            } finally {
                tokenRefreshRef.current = null;
            }
        })();
        tokenRefreshRef.current = run;
        return run;
    }, [updateSession]);

    const uploadFile = useCallback(
        async (
            file: File,
            options?: {
                quiet?: boolean;
                skipRefresh?: boolean;
                skipTrack?: boolean;
                authRetried?: boolean;
            }
        ) => {
            const quiet = Boolean(options?.quiet);
            const skipTrack = Boolean(options?.skipTrack);
            const token = accessTokenRef.current || session?.accessToken || "";
            if (!token || !session?.projectId) {
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
            if (!skipTrack) {
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
            }
            if (!quiet) pushToast(`Uploading ${file.name}…`, "info");
            try {
                const result = await uploadProjectFile(
                    token,
                    session.projectId,
                    file,
                    skipTrack
                        ? undefined
                        : (percent) => {
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
                if (!skipTrack) {
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
                }
                if (!options?.skipRefresh) {
                    await refreshLibrary();
                }
                if (!quiet) {
                    pushToast(
                        alreadyDone
                            ? `Ready: ${file.name}`
                            : `Saved ${file.name} on Amazon. The server indexes it if you leave.`,
                        "success"
                    );
                }
                return { ok: true, skipped: result.status === "skipped" };
            } catch (err) {
                const status = err instanceof CoairApiError ? err.status : 0;
                if (status === 401 && !options?.authRetried) {
                    const next = await refreshUploadAccess();
                    if (next) {
                        return uploadFile(file, { ...options, authRetried: true });
                    }
                }
                const raw =
                    err instanceof Error ? err.message : "Upload failed";
                const message = raw
                    .replace(/^mac_sidecar:\s*/i, "")
                    .replace(/^invalid_pdf:\s*/i, "")
                    .replace(/^unsupported_file_type:\s*/i, "Unsupported file type: ");
                if (!skipTrack) {
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
                }
                if (!quiet) pushToast(message, "error");
                return {
                    ok: false,
                    error: message,
                };
            }
        },
        [pushToast, refreshLibrary, refreshUploadAccess, session?.accessToken, session?.projectId]
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
            await refreshUploadAccess();
            pushToast(
                `Sending ${list.length.toLocaleString()} files to Amazon, 3 at a time. Keep this tab open only until that count finishes. The server then indexes them one by one.`,
                "info"
            );
            const batchId = `batch-${Date.now()}`;
            setFileTransfers((prev) => [
                {
                    id: batchId,
                    name: `${list.length.toLocaleString()} PDFs`,
                    phase: "uploading",
                    percent: 0,
                    stage: `Uploaded 0 of ${list.length.toLocaleString()}`,
                    batchTotal: list.length,
                },
                ...prev,
            ]);
            let cursor = 0;
            let uploaded = 0;
            let skipped = 0;
            let failed = 0;
            let announced = false;
            const publish = () => {
                const finished = uploaded + skipped + failed;
                const sent = finished >= list.length;
                const already =
                    skipped > 0
                        ? ` · ${skipped.toLocaleString()} already saved`
                        : "";
                setFileTransfers((prev) =>
                    prev.map((transfer) =>
                        transfer.id === batchId
                            ? {
                                  ...transfer,
                                  phase: sent ? "injecting" : "uploading",
                                  percent: Math.round((finished / list.length) * 100),
                                  stage: sent
                                      ? `All ${list.length.toLocaleString()} files are on Amazon. The server indexes them one by one if you leave.`
                                      : `Sent ${finished.toLocaleString()} of ${list.length.toLocaleString()} to Amazon${already}`,
                                  error:
                                      failed > 0
                                          ? `${failed.toLocaleString()} failed`
                                          : undefined,
                              }
                            : transfer
                    )
                );
                if (sent && !announced) {
                    announced = true;
                    pushToast(
                        "Files are on Amazon. The server indexes them one by one if you close this page.",
                        "success"
                    );
                }
            };
            const worker = async () => {
                while (cursor < list.length) {
                    if (Date.now() - lastTokenRefreshAt.current > 12 * 60 * 1000) {
                        await refreshUploadAccess();
                    }
                    const file = list[cursor];
                    cursor += 1;
                    let result = await uploadFile(file, {
                        quiet: true,
                        skipRefresh: true,
                        skipTrack: true,
                    });
                    for (let attempt = 1; attempt <= 4; attempt += 1) {
                        if (result.ok || !/network|timeout|502|503|429|reset/i.test(result.error || "")) {
                            break;
                        }
                        await new Promise((resolve) => window.setTimeout(resolve, 3000 * attempt));
                        result = await uploadFile(file, {
                            quiet: true,
                            skipRefresh: true,
                            skipTrack: true,
                        });
                    }
                    if (result.ok) {
                        if (result.skipped) skipped += 1;
                        else uploaded += 1;
                    } else failed += 1;
                    publish();
                    if (Date.now() - lastLibrarySync.current > 20000) {
                        lastLibrarySync.current = Date.now();
                        void refreshLibrary({ silent: true });
                    }
                }
            };
            const workers = Math.min(3, list.length);
            await Promise.all(Array.from({ length: workers }, () => worker()));
            await refreshLibrary();
            const skippedNote =
                skipped > 0
                    ? `${skipped.toLocaleString()} already in the library were skipped`
                    : "";
            if (failed === 0 && uploaded === 0 && skipped > 0) {
                pushToast(skippedNote, "success");
            } else if (failed === 0) {
                pushToast(
                    skippedNote
                        ? `Uploaded ${uploaded} documents. ${skippedNote}.`
                        : `Uploaded ${uploaded} documents to Amazon. The server indexes them one by one.`,
                    "success"
                );
            } else if (uploaded === 0 && skipped === 0) {
                pushToast(`All ${failed} uploads failed`, "error");
            } else {
                pushToast(
                    `Uploaded ${uploaded} of ${list.length}; ${failed} failed${
                        skippedNote ? `. ${skippedNote}` : ""
                    }`,
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
        [pushToast, refreshLibrary, refreshUploadAccess, uploadFile]
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

    const reinjectFile = useCallback(
        async (fileId: string) => {
            if (!session?.accessToken || !session.projectId) {
                return { ok: false, error: "No project selected" };
            }
            try {
                await reindexProjectFile(
                    session.accessToken,
                    session.projectId,
                    fileId
                );
                await refreshLibrary();
                pushToast("Reinjecting document", "info");
                return { ok: true };
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : "Reinject failed";
                pushToast(message, "error");
                return { ok: false, error: message };
            }
        },
        [pushToast, refreshLibrary, session?.accessToken, session?.projectId]
    );

    const pinFile = useCallback(
        async (fileId: string, pinned: boolean) => {
            if (!session?.accessToken || !session.projectId) {
                return { ok: false, error: "No project selected" };
            }
            const previous = documents.find((doc) => doc.id === fileId)?.pinned;
            setDocuments((current) =>
                current.map((doc) =>
                    doc.id === fileId ? { ...doc, pinned } : doc
                )
            );
            try {
                await pinProjectFile(
                    session.accessToken,
                    session.projectId,
                    fileId,
                    pinned
                );
                pushToast(pinned ? "File pinned" : "File unpinned", "info");
                void refreshLibrary();
                return { ok: true };
            } catch (err) {
                setDocuments((current) =>
                    current.map((doc) =>
                        doc.id === fileId
                            ? { ...doc, pinned: Boolean(previous) }
                            : doc
                    )
                );
                const message =
                    err instanceof Error ? err.message : "Could not pin file";
                pushToast(message, "error");
                return { ok: false, error: message };
            }
        },
        [documents, pushToast, refreshLibrary, session?.accessToken, session?.projectId]
    );

    const downloadFile = useCallback(
        async (fileId: string, fileName: string) => {
            if (!session?.accessToken || !session.projectId) {
                return { ok: false, error: "No project selected" };
            }
            try {
                await downloadProjectFile(
                    session.accessToken,
                    session.projectId,
                    fileId,
                    fileName
                );
                return { ok: true };
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : "Download failed";
                pushToast(message, "error");
                return { ok: false, error: message };
            }
        },
        [pushToast, session?.accessToken, session?.projectId]
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
            createProject,
            renameProject,
            deleteProject,
            uploadFile,
            uploadFiles,
            removeFile,
            reinjectFile,
            pinFile,
            downloadFile,
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
            downloadFile,
            pinFile,
            refresh,
            reinjectFile,
            removeFile,
            selectProject,
            createProject,
            renameProject,
            deleteProject,
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
