"use client";

import { FormEvent, useState } from "react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import Icon from "@/components/Icon";
import { useAuth } from "@/context/AuthContext";
import { useLiveWorkspace } from "@/context/LiveWorkspaceContext";

const ProjectSwitcher = () => {
    const { session } = useAuth();
    const {
        enabled,
        loading,
        projects,
        selectProject,
        createProject,
        renameProject,
        deleteProject,
        fileTransfers,
    } = useLiveWorkspace();
    const [draft, setDraft] = useState("");
    const [creating, setCreating] = useState(false);
    const [busy, setBusy] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [renameDraft, setRenameDraft] = useState("");
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const current = projects.find(
        (project) => project.project_id === session?.projectId
    );
    const canManage =
        session?.role === "company_admin" || session?.role === "super_admin";
    const sending = fileTransfers.some(
        (transfer) => transfer.phase === "uploading"
    );

    if (!enabled) return null;

    const onCreate = async (event: FormEvent) => {
        event.preventDefault();
        if (!draft.trim() || busy) return;
        setBusy(true);
        const result = await createProject(draft);
        setBusy(false);
        if (result.ok) {
            setDraft("");
            setCreating(false);
        }
    };

    const onRename = async (event: FormEvent, projectId: string) => {
        event.preventDefault();
        if (!renameDraft.trim() || busy) return;
        setBusy(true);
        const result = await renameProject(projectId, renameDraft);
        setBusy(false);
        if (result.ok) {
            setEditingId(null);
            setRenameDraft("");
        }
    };

    const onDelete = async (projectId: string) => {
        if (busy) return;
        setBusy(true);
        const result = await deleteProject(projectId);
        setBusy(false);
        if (result.ok) setConfirmDeleteId(null);
    };

    return (
        <Menu as="div" className="relative min-w-0">
            <MenuButton
                disabled={sending}
                title={
                    sending
                        ? "This send is still going to the current project"
                        : undefined
                }
                className="flex h-10 w-full min-w-0 max-w-72 items-center justify-between gap-2 rounded-xl border border-stroke-soft-200 bg-white-0 px-3 text-left text-label-sm text-strong-950 outline-none transition-colors hover:border-stroke-sub-300 disabled:cursor-not-allowed disabled:opacity-60 max-lg:max-w-36"
            >
                <span className="truncate">
                    {loading && projects.length === 0
                        ? "Loading projects"
                        : current?.name || "Select project"}
                </span>
                <Icon className="size-4 shrink-0 fill-sub-600" name="chevron" />
            </MenuButton>
            <MenuItems
                transition
                anchor="bottom start"
                modal={false}
                className="z-30 w-80 origin-top-left rounded-xl border border-stroke-soft-200 bg-white-0 p-1 shadow-xl outline-0 [--anchor-gap:0.5rem]"
            >
                <div className="max-h-64 overflow-auto">
                    {projects.length === 0 ? (
                        <div className="px-3 py-2 text-label-xs text-soft-400">
                            No projects yet
                        </div>
                    ) : (
                        projects.map((project) => (
                            <div
                                key={project.project_id}
                                className="flex items-center gap-1"
                            >
                                {editingId === project.project_id ? (
                                    <form
                                        className="flex min-w-0 grow items-center gap-1 px-1 py-1"
                                        onSubmit={(event) =>
                                            void onRename(event, project.project_id)
                                        }
                                    >
                                        <input
                                            autoFocus
                                            value={renameDraft}
                                            className="h-8 min-w-0 grow rounded-lg bg-weak-50 px-2 text-label-sm text-strong-950 outline-none"
                                            onChange={(event) =>
                                                setRenameDraft(event.target.value)
                                            }
                                            onKeyDown={(event) => {
                                                if (event.key === "Escape") {
                                                    setEditingId(null);
                                                }
                                            }}
                                        />
                                        <button
                                            type="submit"
                                            disabled={busy || !renameDraft.trim()}
                                            className="h-8 shrink-0 rounded-lg bg-strong-950 px-2 text-label-xs text-white-0 disabled:opacity-40"
                                        >
                                            Save
                                        </button>
                                    </form>
                                ) : (
                                    <>
                                        <MenuItem>
                                            <button
                                                type="button"
                                                className="flex h-9 min-w-0 grow items-center rounded-lg px-3 text-left text-label-sm text-strong-950 data-focus:bg-weak-50"
                                                onClick={() =>
                                                    selectProject(project.project_id)
                                                }
                                            >
                                                <span className="truncate">
                                                    {project.name}
                                                </span>
                                            </button>
                                        </MenuItem>
                                        {canManage ? (
                                            confirmDeleteId === project.project_id ? (
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    className="h-8 shrink-0 rounded-lg px-2 text-label-xs text-red-500 hover:bg-weak-50 disabled:opacity-40"
                                                    onClick={() =>
                                                        void onDelete(project.project_id)
                                                    }
                                                >
                                                    Confirm
                                                </button>
                                            ) : (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="h-8 shrink-0 rounded-lg px-2 text-label-xs text-sub-600 hover:bg-weak-50 hover:text-strong-950"
                                                        onClick={() => {
                                                            setCreating(false);
                                                            setConfirmDeleteId(null);
                                                            setEditingId(project.project_id);
                                                            setRenameDraft(project.name);
                                                        }}
                                                    >
                                                        Rename
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="h-8 shrink-0 rounded-lg px-2 text-label-xs text-sub-600 hover:bg-weak-50 hover:text-red-500"
                                                        onClick={() => {
                                                            setEditingId(null);
                                                            setConfirmDeleteId(
                                                                project.project_id
                                                            );
                                                        }}
                                                    >
                                                        Delete
                                                    </button>
                                                </>
                                            )
                                        ) : null}
                                    </>
                                )}
                            </div>
                        ))
                    )}
                </div>
                <div className="mt-1 border-t border-stroke-soft-200 p-1">
                    {creating ? (
                        <form
                            className="flex items-center gap-1"
                            onSubmit={(event) => void onCreate(event)}
                        >
                            <input
                                autoFocus
                                value={draft}
                                placeholder="Project name"
                                className="h-9 min-w-0 grow rounded-lg bg-weak-50 px-3 text-label-sm text-strong-950 outline-none"
                                onChange={(event) => setDraft(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Escape") setCreating(false);
                                }}
                            />
                            <button
                                type="submit"
                                disabled={busy || !draft.trim()}
                                className="h-9 shrink-0 rounded-lg bg-strong-950 px-3 text-label-xs text-white-0 disabled:opacity-40"
                            >
                                Create
                            </button>
                        </form>
                    ) : (
                        <button
                            type="button"
                            className="flex h-9 w-full items-center rounded-lg px-3 text-left text-label-sm text-blue-500 hover:bg-weak-50"
                            onClick={() => {
                                setEditingId(null);
                                setCreating(true);
                            }}
                        >
                            Create project
                        </button>
                    )}
                </div>
            </MenuItems>
        </Menu>
    );
};

export default ProjectSwitcher;
