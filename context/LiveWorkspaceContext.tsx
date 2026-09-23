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
    listLibrary,
    listProjects,
    uploadProjectFile,
} from "@/lib/coair/workspace";
import { addOnsFromModuleGrants } from "@/lib/workspace/companyForSession";

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
    selectProject: (projectId: string) => void;
    uploadFile: (file: File) => Promise<{ ok: boolean; error?: string }>;
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
    const lastProjectId = useRef<string | null | undefined>(undefined);

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

    const uploadFile = useCallback(
        async (file: File) => {
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
                pushToast(message, "error");
                return { ok: false, error: message };
            }
            try {
                await uploadProjectFile(
                    session.accessToken,
                    session.projectId,
                    file
                );
                await refreshLibrary();
                pushToast(`Uploaded ${file.name}`, "success");
                return { ok: true };
            } catch (err) {
                const raw =
                    err instanceof Error ? err.message : "Upload failed";
                const message = raw
                    .replace(/^mac_sidecar:\s*/i, "")
                    .replace(/^invalid_pdf:\s*/i, "")
                    .replace(/^unsupported_file_type:\s*/i, "Unsupported file type: ");
                pushToast(message, "error");
                return {
                    ok: false,
                    error: message,
                };
            }
        },
        [pushToast, refreshLibrary, session?.accessToken, session?.projectId]
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
            selectProject,
            uploadFile,
            removeFile,
            refresh,
        }),
        [
            accountUsage,
            documents,
            enabled,
            error,
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
