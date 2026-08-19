"use client";

import { FormEvent, useState } from "react";
import PageHeader from "@/components/Admin/PageHeader";
import OrgRoleSelect from "@/components/Admin/OrgRoleSelect";
import RightsToggleCells from "@/components/Admin/RightsToggleCells";
import StatusBadge from "@/components/Admin/StatusBadge";
import { isValidInviteEmail } from "@/lib/admin/wave2Helpers";
import {
    RIGHT_COLUMNS,
    rightsFromFeatures,
    toggleRightInFeatures,
    type RightKey,
} from "@/lib/admin/rolesStub";
import { apiErrorMessage } from "@/lib/coair/commerce";
import { inviteOrgUser } from "@/lib/coair/ops";
import { patchOrgUser } from "@/lib/coair/org";
import { useLiveOrg } from "@/lib/coair/useLiveOrg";
import { useAuth } from "@/context/AuthContext";

const LiveTeamPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const { users, loading, error, deactivate, refresh } = useLiveOrg();
    const [email, setEmail] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [tempPassword, setTempPassword] = useState<string | null>(null);
    const [showInvite, setShowInvite] = useState(false);
    const ownerCount = users.filter((user) => user.org_role === "owner").length;
    const currentUsername = session?.username ?? session?.email ?? "";

    const onInvite = async (event: FormEvent) => {
        event.preventDefault();
        if (!isValidInviteEmail(email)) {
            setMessage("Enter a valid email address");
            return;
        }
        try {
            const invited = await inviteOrgUser(token, {
                email: email.trim(),
                displayName: displayName.trim() || undefined,
            });
            setTempPassword(invited.temporary_password || null);
            if (invited.email_sent === false) {
                setMessage(
                    invited.temporary_password
                        ? `User created but email failed — copy the temporary password below. (${invited.email_error ?? "send failed"})`
                        : `User created but the invite email could not be sent. (${invited.email_error ?? "send failed"})`
                );
            } else if (invited.invited || !invited.temporary_password) {
                setMessage(
                    `Invite sent to ${invited.username}. They will get a COAir email with sign-in details.`
                );
            } else {
                setMessage(`Invited ${invited.username}. Copy the password now.`);
            }
            setEmail("");
            setDisplayName("");
            await refresh();
        } catch (err) {
            setTempPassword(null);
            setMessage(apiErrorMessage(err));
        }
    };

    const changeRole = async (username: string, orgRole: "owner" | "member") => {
        try {
            await patchOrgUser(token, username, { org_role: orgRole });
            setMessage(`Role updated for ${username}`);
            await refresh();
        } catch (err) {
            setMessage(apiErrorMessage(err));
        }
    };

    const toggleRight = async (
        username: string,
        features: Record<string, boolean> | undefined,
        role: string,
        key: RightKey,
        enabled: boolean
    ) => {
        const next = toggleRightInFeatures(features, role, key, enabled);
        try {
            await patchOrgUser(token, username, {
                features: next,
            });
            setMessage(`Rights updated for ${username}`);
            await refresh();
        } catch (err) {
            setMessage(apiErrorMessage(err));
        }
    };

    return (
        <div className="page-stack">
            <PageHeader
                title="Team"
                description="Invite teammates, change company role, and grant module rights."
                action={
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setShowInvite((value) => !value);
                            }}
                            className="h-10 rounded-full bg-strong-950 px-4 text-label-sm text-white-0 hover:opacity-90"
                        >
                            {showInvite ? "Close invite" : "Invite teammate"}
                        </button>
                    </div>
                }
            />
            {error ? (
                <p className="text-label-sm text-red-500">{error}</p>
            ) : null}
            {message ? (
                <p className="text-label-sm text-sub-600">{message}</p>
            ) : null}
            {tempPassword ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-label-sm text-strong-950">
                        Temporary password (shown once)
                    </p>
                    <code className="mt-2 block break-all font-mono text-label-sm">
                        {tempPassword}
                    </code>
                </div>
            ) : null}
            {showInvite ? (
                <form onSubmit={(event) => void onInvite(event)} className="surface-panel p-5">
                    <h2 className="text-label-lg text-strong-950">Invite user</h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Username is the email address. They set a password from
                        the invite email.
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <input
                            required
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="Work email"
                            className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm"
                        />
                        <input
                            value={displayName}
                            onChange={(event) => setDisplayName(event.target.value)}
                            placeholder="Display name"
                            className="h-10 rounded-xl border border-stroke-soft-200 px-3 text-label-sm"
                        />
                    </div>
                    <button
                        type="submit"
                        className="mt-4 h-10 rounded-full bg-blue-500 px-4 text-label-sm text-white-0"
                    >
                        Send invite
                    </button>
                </form>
            ) : null}
            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1080px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">Name</th>
                                <th className="px-5 py-3 font-medium">Username</th>
                                <th className="px-5 py-3 font-medium">Role</th>
                                {RIGHT_COLUMNS.map((column) => (
                                    <th
                                        key={column.key}
                                        className="px-5 py-3 text-center font-medium"
                                    >
                                        {column.label}
                                    </th>
                                ))}
                                <th className="px-5 py-3 font-medium">Status</th>
                                <th className="px-5 py-3 font-medium">Projects</th>
                                <th className="px-5 py-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {loading && users.length === 0 ? (
                                <tr>
                                    <td className="px-5 py-4 text-label-sm text-sub-600" colSpan={12}>
                                        Loading team…
                                    </td>
                                </tr>
                            ) : null}
                            {users.map((user) => (
                                <tr key={user.username} className="text-label-sm">
                                    <td className="px-5 py-4 text-strong-950">
                                        {user.display_name || user.username}
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {user.username}
                                    </td>
                                    <td className="px-5 py-4">
                                        <OrgRoleSelect
                                            value={user.org_role || "member"}
                                            disabled={
                                                user.username === currentUsername ||
                                                (user.org_role === "owner" &&
                                                    ownerCount <= 1)
                                            }
                                            onChange={(role) =>
                                                void changeRole(user.username, role)
                                            }
                                        />
                                    </td>
                                    <RightsToggleCells
                                        rights={rightsFromFeatures(
                                            user.features,
                                            user.org_role || "member"
                                        )}
                                        onToggle={(key, enabled) =>
                                            void toggleRight(
                                                user.username,
                                                user.features,
                                                user.org_role || "member",
                                                key,
                                                enabled
                                            )
                                        }
                                    />
                                    <td className="px-5 py-4">
                                        <StatusBadge
                                            status={
                                                user.is_active === false
                                                    ? "suspended"
                                                    : "active"
                                            }
                                        />
                                    </td>
                                    <td className="px-5 py-4 text-sub-600">
                                        {user.project_count ?? 0}
                                    </td>
                                    <td className="px-5 py-4">
                                        {user.org_role !== "owner" &&
                                        user.is_active !== false ? (
                                            <button
                                                type="button"
                                                className="text-label-xs text-red-500"
                                                onClick={() =>
                                                    void deactivate(user.username)
                                                        .then((result) => {
                                                            if (!result.ok) {
                                                                setMessage(
                                                                    result.error ??
                                                                        "Deactivate failed"
                                                                );
                                                                return;
                                                            }
                                                            setMessage(
                                                                `Removed ${user.username} from the team`
                                                            );
                                                        })
                                                }
                                            >
                                                Deactivate
                                            </button>
                                        ) : (
                                            "—"
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};

export default LiveTeamPage;
