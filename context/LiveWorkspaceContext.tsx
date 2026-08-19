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
import { mapLibraryDocuments } from "@/lib/coair/mapLibrary";
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
    selectProject: (projectId: string) => void;
    uploadFile: (file: File) => Promise<{ ok: boolean; error?: string }>;
    removeFile: (fileId: string) => Promise<{ ok: boolean; error?: string }>;
    refresh: () => Promise<void>;
};

const LiveWorkspaceContext = createContext<LiveWorkspaceValue | null>(null);

export function LiveWorkspaceProvider({ children }: { children: ReactNode }) {
    const { session, updateSession } = useAuth();
    const enabled = session?.source === "live" && Boolean(session.accessToken);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [projects, setProjects] = useState<CoairProject[]>([]);
    const [documents, setDocuments] = useState<CompanyDocument[]>([]);
    const [accountUsage, setAccountUsage] = useState<AccountUsage | null>(null);

    const refresh = useCallback(async () => {
        if (!enabled || !session?.accessToken) {
            setProjects([]);
            setDocuments([]);
            setAccountUsage(null);
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
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to load project");
        } finally {
            setLoading(false);
        }
    }, [enabled, session?.accessToken, session?.companyId, session?.projectId]);

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

    const value = useMemo(
        () => ({
            enabled,
            loading,
            error,
            projects,
            documents,
            accountUsage,
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
            projects,
            refresh,
            removeFile,
            selectProject,
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
