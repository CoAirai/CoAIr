"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import type { CompanyDocument } from "@/lib/admin/companyDocuments";
import type { WorkspaceUser } from "@/lib/chat/threads";
import { mapLibraryDocuments } from "@/lib/coair/mapLibrary";
import {
    ensureSelfInWorkspaceUsers,
    mapLiveOrgUsersToWorkspaceUsers,
} from "@/lib/coair/mapWorkspaceUsers";
import { listOrgUsers, type CoairOrgUser } from "@/lib/coair/org";
import type { CoairProject } from "@/lib/coair/types";
import {
    deleteProjectFile,
    listLibrary,
    listProjects,
    uploadProjectFile,
} from "@/lib/coair/workspace";

type AccountUsage = {
    used_tokens?: number;
    token_limit?: number;
    credits_remaining?: number;
    credits_total?: number;
    storage_used_bytes?: number;
    storage_limit_bytes?: number;
    percent_remaining?: number;
};

type LiveWorkspaceValue = {
    enabled: boolean;
    loading: boolean;
    error: string | null;
    projects: CoairProject[];
    documents: CompanyDocument[];
    accountUsage: AccountUsage | null;
    /** Live org members for company-admin workspace switcher. */
    teammates: WorkspaceUser[];
    orgUsers: CoairOrgUser[];
    selectProject: (projectId: string) => void;
    uploadFile: (file: File) => Promise<{ ok: boolean; error?: string }>;
    removeFile: (fileId: string) => Promise<{ ok: boolean; error?: string }>;
    refresh: () => Promise<void>;
};

const LiveWorkspaceContext = createContext<LiveWorkspaceValue | null>(null);

export function LiveWorkspaceProvider({ children }: { children: ReactNode }) {
    const { session, updateSession } = useAuth();
    const enabled = session?.source === "live" && Boolean(session.accessToken);
    const canListTeammates =
        enabled && session?.role === "company_admin" && Boolean(session.companyId);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [projects, setProjects] = useState<CoairProject[]>([]);
    const [documents, setDocuments] = useState<CompanyDocument[]>([]);
    const [accountUsage, setAccountUsage] = useState<AccountUsage | null>(null);
    const [orgUsers, setOrgUsers] = useState<CoairOrgUser[]>([]);

    const refresh = useCallback(async () => {
        if (!enabled || !session?.accessToken) {
            setProjects([]);
            setDocuments([]);
            setAccountUsage(null);
            setOrgUsers([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const listed = await listProjects(session.accessToken);
            setProjects(listed.projects ?? []);
            setAccountUsage(listed.account_usage ?? null);
            if (session.projectId) {
                const library = await listLibrary(
                    session.accessToken,
                    session.projectId
                );
                setDocuments(
                    mapLibraryDocuments(library, session.companyId ?? "live")
                );
            } else {
                setDocuments([]);
            }
            if (canListTeammates) {
                try {
                    const team = await listOrgUsers(session.accessToken);
                    setOrgUsers(team.users ?? []);
                } catch {
                    setOrgUsers([]);
                }
            } else {
                setOrgUsers([]);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to load project");
        } finally {
            setLoading(false);
        }
    }, [
        canListTeammates,
        enabled,
        session?.accessToken,
        session?.companyId,
        session?.projectId,
    ]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

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
            try {
                await uploadProjectFile(
                    session.accessToken,
                    session.projectId,
                    file
                );
                await refresh();
                return { ok: true };
            } catch (err) {
                return {
                    ok: false,
                    error: err instanceof Error ? err.message : "Upload failed",
                };
            }
        },
        [refresh, session?.accessToken, session?.projectId]
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
                await refresh();
                return { ok: true };
            } catch (err) {
                return {
                    ok: false,
                    error: err instanceof Error ? err.message : "Delete failed",
                };
            }
        },
        [refresh, session?.accessToken, session?.projectId]
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

    const value = useMemo(
        () => ({
            enabled,
            loading,
            error,
            projects,
            documents,
            accountUsage,
            teammates,
            orgUsers,
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
            loading,
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
