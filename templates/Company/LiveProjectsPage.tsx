"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import PageHeader from "@/components/Admin/PageHeader";
import { useAuth } from "@/context/AuthContext";
import { apiErrorMessage } from "@/lib/coair/commerce";
import { listOrgUsers, type CoairOrgUser } from "@/lib/coair/org";
import type { CoairProject } from "@/lib/coair/types";
import {
    createProject,
    grantOrgProjectAccess,
    listOrgProjectMembers,
    listOrgProjects,
    revokeOrgProjectAccess,
} from "@/lib/coair/workspace";

type ProjectMember = {
    username: string;
    display_name?: string;
    role: string;
};

const LiveProjectsPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const [projects, setProjects] = useState<CoairProject[]>([]);
    const [users, setUsers] = useState<CoairOrgUser[]>([]);
    const [selectedId, setSelectedId] = useState<string>("");
    const [members, setMembers] = useState<ProjectMember[]>([]);
    const [name, setName] = useState("");
    const [assignUser, setAssignUser] = useState("");
    const [assignRole, setAssignRole] = useState<"editor" | "viewer" | "owner">(
        "editor"
    );
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        setError(null);
        try {
            const [projectPayload, userPayload] = await Promise.all([
                listOrgProjects(token),
                listOrgUsers(token),
            ]);
            const nextProjects = projectPayload.projects ?? [];
            setProjects(nextProjects);
            setUsers(userPayload.users ?? []);
            setSelectedId((current) => {
                if (current && nextProjects.some((p) => p.project_id === current)) {
                    return current;
                }
                return nextProjects[0]?.project_id ?? "";
            });
        } catch (err) {
            setError(apiErrorMessage(err));
        } finally {
            setLoading(false);
        }
    }, [token]);

    const refreshMembers = useCallback(async () => {
        if (!token || !selectedId) {
            setMembers([]);
            return;
        }
        try {
            const payload = await listOrgProjectMembers(token, selectedId);
            setMembers(payload.members ?? []);
        } catch (err) {
            setError(apiErrorMessage(err));
        }
    }, [token, selectedId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        void refreshMembers();
    }, [refreshMembers]);

    const onCreate = async (event: FormEvent) => {
        event.preventDefault();
        if (!token || !name.trim()) return;
        setError(null);
        setMessage(null);
        try {
            const created = await createProject(token, name.trim());
            setName("");
            setMessage(`Created project “${created.name}”.`);
            await refresh();
            setSelectedId(created.project_id);
        } catch (err) {
            setError(apiErrorMessage(err));
        }
    };

    const onAssign = async (event: FormEvent) => {
        event.preventDefault();
        if (!token || !selectedId || !assignUser) return;
        setError(null);
        setMessage(null);
        try {
            await grantOrgProjectAccess(token, selectedId, assignUser, assignRole);
            setMessage(`Assigned ${assignUser} as ${assignRole}.`);
            await refreshMembers();
            await refresh();
        } catch (err) {
            setError(apiErrorMessage(err));
        }
    };

    const onRevoke = async (username: string) => {
        if (!token || !selectedId) return;
        setError(null);
        try {
            await revokeOrgProjectAccess(token, selectedId, username);
            setMessage(`Removed ${username} from project.`);
            await refreshMembers();
            await refresh();
        } catch (err) {
            setError(apiErrorMessage(err));
        }
    };

    const selected = projects.find((p) => p.project_id === selectedId);
    const assignable = users.filter(
        (user) =>
            user.username &&
            !members.some((member) => member.username === user.username)
    );

    return (
        <div className="page-stack">
            <PageHeader
                title="Projects"
                description="Create company projects and assign teammates as owner, editor, or viewer."
            />
            {error ? (
                <p className="text-label-sm text-red-500">{error}</p>
            ) : null}
            {message ? (
                <p className="text-label-sm text-green-600">{message}</p>
            ) : null}

            <form
                onSubmit={(event) => void onCreate(event)}
                className="surface-panel flex flex-wrap items-end gap-3 p-5"
            >
                <label className="min-w-[220px] grow">
                    <span className="mb-1 block text-label-xs text-sub-600">
                        New project name
                    </span>
                    <input
                        required
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Tower A"
                        className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm"
                    />
                </label>
                <button
                    type="submit"
                    className="h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0"
                >
                    Create project
                </button>
            </form>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
                <section className="surface-panel p-4">
                    <h2 className="text-label-md text-strong-950">Projects</h2>
                    {loading && projects.length === 0 ? (
                        <p className="mt-3 text-label-sm text-sub-600">Loading…</p>
                    ) : null}
                    <ul className="mt-3 space-y-1">
                        {projects.map((project) => (
                            <li key={project.project_id}>
                                <button
                                    type="button"
                                    onClick={() => setSelectedId(project.project_id)}
                                    className={`w-full rounded-xl px-3 py-2 text-left text-label-sm transition-colors ${
                                        selectedId === project.project_id
                                            ? "bg-weak-50 text-strong-950"
                                            : "text-sub-600 hover:bg-weak-50/70"
                                    }`}
                                >
                                    {project.name}
                                </button>
                            </li>
                        ))}
                        {!loading && projects.length === 0 ? (
                            <li className="px-1 text-label-sm text-sub-600">
                                No projects yet. Create one above.
                            </li>
                        ) : null}
                    </ul>
                </section>

                <section className="surface-panel p-5">
                    {selected ? (
                        <>
                            <h2 className="text-label-lg text-strong-950">
                                {selected.name}
                            </h2>
                            <p className="mt-1 text-label-xs text-sub-600">
                                Team members only see projects they are assigned to.
                            </p>

                            <form
                                onSubmit={(event) => void onAssign(event)}
                                className="mt-4 flex flex-wrap items-end gap-3"
                            >
                                <label className="min-w-[180px] grow">
                                    <span className="mb-1 block text-label-xs text-sub-600">
                                        Teammate
                                    </span>
                                    <select
                                        required
                                        value={assignUser}
                                        onChange={(event) =>
                                            setAssignUser(event.target.value)
                                        }
                                        className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm"
                                    >
                                        <option value="">Select user</option>
                                        {assignable.map((user) => (
                                            <option
                                                key={user.username}
                                                value={user.username}
                                            >
                                                {user.display_name || user.username}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    <span className="mb-1 block text-label-xs text-sub-600">
                                        Role
                                    </span>
                                    <select
                                        value={assignRole}
                                        onChange={(event) =>
                                            setAssignRole(
                                                event.target.value as
                                                    | "editor"
                                                    | "viewer"
                                                    | "owner"
                                            )
                                        }
                                        className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm"
                                    >
                                        <option value="editor">Editor</option>
                                        <option value="viewer">Viewer</option>
                                        <option value="owner">Owner</option>
                                    </select>
                                </label>
                                <button
                                    type="submit"
                                    className="h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0"
                                >
                                    Assign
                                </button>
                            </form>

                            <ul className="mt-5 divide-y divide-stroke-soft-200">
                                {members.map((member) => (
                                    <li
                                        key={member.username}
                                        className="flex items-center justify-between gap-3 py-3 text-label-sm"
                                    >
                                        <div>
                                            <div className="text-strong-950">
                                                {member.display_name ||
                                                    member.username}
                                            </div>
                                            <div className="text-label-xs text-sub-600">
                                                {member.username} · {member.role}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                void onRevoke(member.username)
                                            }
                                            className="text-label-xs text-red-500 hover:underline"
                                        >
                                            Remove
                                        </button>
                                    </li>
                                ))}
                                {members.length === 0 ? (
                                    <li className="py-3 text-label-sm text-sub-600">
                                        No members assigned yet.
                                    </li>
                                ) : null}
                            </ul>
                        </>
                    ) : (
                        <p className="text-label-sm text-sub-600">
                            Select or create a project to manage access.
                        </p>
                    )}
                </section>
            </div>
        </div>
    );
};

export default LiveProjectsPage;
