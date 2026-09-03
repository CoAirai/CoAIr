"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { confirmPurchase, inviteOrgUser } from "@/lib/coair/ops";
import {
    approveMemberTokenRequest,
    denyMemberTokenRequest,
    listMemberTokenRequests,
    patchOrgUser,
    type CoairMemberTokenRequest,
} from "@/lib/coair/org";
import { useLiveOrg } from "@/lib/coair/useLiveOrg";
import { useAuth } from "@/context/AuthContext";

const fmt = new Intl.NumberFormat("en-US");

const LiveTeamPage = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const searchParams = useSearchParams();
    const { users, loading, error, deactivate, refresh } = useLiveOrg();
    const [email, setEmail] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [tempPassword, setTempPassword] = useState<string | null>(null);
    const [showInvite, setShowInvite] = useState(false);
    const [tokenRequests, setTokenRequests] = useState<CoairMemberTokenRequest[]>(
        []
    );
    const [donorByRequest, setDonorByRequest] = useState<Record<string, string>>(
        {}
    );
    const [buyAmountByRequest, setBuyAmountByRequest] = useState<
        Record<string, string>
    >({});
    const ownerCount = users.filter((user) => user.org_role === "owner").length;
    const currentUsername = session?.username ?? session?.email ?? "";

    const donors = useMemo(
        () =>
            users
                .filter((user) => {
                    const used = user.used_tokens ?? 0;
                    const limit = user.token_limit ?? 0;
                    return limit - used > 0;
                })
                .map((user) => ({
                    username: user.username,
                    unused: Math.max(
                        0,
                        (user.token_limit ?? 0) - (user.used_tokens ?? 0)
                    ),
                })),
        [users]
    );

    const loadRequests = useCallback(async () => {
        if (!token) return;
        try {
            const listed = await listMemberTokenRequests(token);
            setTokenRequests(
                (listed.requests ?? []).filter((row) => row.status === "pending")
            );
        } catch {
            /* non-blocking */
        }
    }, [token]);

    useEffect(() => {
        void loadRequests();
    }, [loadRequests]);

    useEffect(() => {
        const sessionId = searchParams.get("session_id");
        if (!sessionId || !token) return;
        void confirmPurchase(token, sessionId)
            .then(async () => {
                setMessage("Token purchase confirmed and credited.");
                await Promise.all([refresh(), loadRequests()]);
            })
            .catch((err) => setMessage(apiErrorMessage(err)));
    }, [searchParams, token, refresh, loadRequests]);

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

    const approveTransfer = async (request: CoairMemberTokenRequest) => {
        const donor =
            donorByRequest[request.id] ||
            donors.find((row) => row.username !== request.username)?.username ||
            "";
        if (!donor) {
            setMessage("Pick a teammate with unused tokens to transfer from.");
            return;
        }
        try {
            await approveMemberTokenRequest(token, request.id, {
                mode: "transfer",
                from_username: donor,
                tokens: request.tokens,
            });
            setMessage(`Transferred tokens to ${request.username}`);
            await Promise.all([refresh(), loadRequests()]);
        } catch (err) {
            setMessage(apiErrorMessage(err));
        }
    };

    const approvePurchase = async (request: CoairMemberTokenRequest) => {
        const amount = Number(buyAmountByRequest[request.id] || "0");
        try {
            const result = await approveMemberTokenRequest(token, request.id, {
                mode: "purchase",
                tokens: request.tokens,
                amount_usd: Number.isFinite(amount) ? amount : 0,
            });
            const checkout = result.checkout as
                | { checkout_url?: string; url?: string; session_id?: string }
                | undefined;
            const url = checkout?.checkout_url || checkout?.url;
            if (url && typeof window !== "undefined") {
                window.location.assign(url);
                return;
            }
            setMessage(`Purchased tokens for ${request.username}`);
            await Promise.all([refresh(), loadRequests()]);
        } catch (err) {
            setMessage(apiErrorMessage(err));
        }
    };

    const denyRequest = async (request: CoairMemberTokenRequest) => {
        try {
            await denyMemberTokenRequest(token, request.id);
            setMessage(`Denied request from ${request.username}`);
            await loadRequests();
        } catch (err) {
            setMessage(apiErrorMessage(err));
        }
    };

    return (
        <div className="page-stack">
            <PageHeader
                title="Team"
                description="Invite teammates, change company role, and grant module rights. Token shares come from the company pool."
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
                        the invite email. New members rebalance remaining pool
                        tokens equally.
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

            {tokenRequests.length > 0 ? (
                <section className="surface-panel p-5">
                    <h2 className="text-label-lg text-strong-950">
                        Token requests
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Approve by moving unused tokens from another member, or
                        buy more for the requester.
                    </p>
                    <ul className="mt-4 space-y-4">
                        {tokenRequests.map((request) => (
                            <li
                                key={request.id}
                                className="rounded-xl border border-stroke-soft-200 p-4"
                            >
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <p className="text-label-sm text-strong-950">
                                        {request.username} ·{" "}
                                        {fmt.format(request.tokens)} tokens
                                    </p>
                                    <p className="text-label-xs text-sub-600">
                                        {request.created_at}
                                    </p>
                                </div>
                                {request.reason ? (
                                    <p className="mt-1 text-label-xs text-sub-600">
                                        {request.reason}
                                    </p>
                                ) : null}
                                <div className="mt-3 flex flex-wrap items-end gap-2">
                                    <label className="text-label-xs text-sub-600">
                                        Transfer from
                                        <select
                                            className="mt-1 block h-9 min-w-48 rounded-lg border border-stroke-soft-200 px-2 text-label-sm"
                                            value={
                                                donorByRequest[request.id] || ""
                                            }
                                            onChange={(event) =>
                                                setDonorByRequest((prev) => ({
                                                    ...prev,
                                                    [request.id]:
                                                        event.target.value,
                                                }))
                                            }
                                        >
                                            <option value="">Select donor</option>
                                            {donors
                                                .filter(
                                                    (donor) =>
                                                        donor.username !==
                                                        request.username
                                                )
                                                .map((donor) => (
                                                    <option
                                                        key={donor.username}
                                                        value={donor.username}
                                                    >
                                                        {donor.username} (
                                                        {fmt.format(donor.unused)}{" "}
                                                        unused)
                                                    </option>
                                                ))}
                                        </select>
                                    </label>
                                    <button
                                        type="button"
                                        className="h-9 rounded-full bg-strong-950 px-3 text-label-xs text-white-0"
                                        onClick={() =>
                                            void approveTransfer(request)
                                        }
                                    >
                                        Transfer
                                    </button>
                                    <label className="text-label-xs text-sub-600">
                                        Buy USD
                                        <input
                                            type="number"
                                            min={0}
                                            step="0.01"
                                            value={
                                                buyAmountByRequest[request.id] ??
                                                "0"
                                            }
                                            onChange={(event) =>
                                                setBuyAmountByRequest((prev) => ({
                                                    ...prev,
                                                    [request.id]:
                                                        event.target.value,
                                                }))
                                            }
                                            className="mt-1 block h-9 w-28 rounded-lg border border-stroke-soft-200 px-2 text-label-sm"
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        className="h-9 rounded-full bg-blue-500 px-3 text-label-xs text-white-0"
                                        onClick={() =>
                                            void approvePurchase(request)
                                        }
                                    >
                                        Buy for user
                                    </button>
                                    <button
                                        type="button"
                                        className="h-9 rounded-full border border-stroke-soft-200 px-3 text-label-xs text-red-500"
                                        onClick={() => void denyRequest(request)}
                                    >
                                        Deny
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1280px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">Name</th>
                                <th className="px-5 py-3 font-medium">Username</th>
                                <th className="px-5 py-3 font-medium">Role</th>
                                <th className="px-5 py-3 font-medium">Used</th>
                                <th className="px-5 py-3 font-medium">Limit</th>
                                <th className="px-5 py-3 font-medium">
                                    Remaining
                                </th>
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
                                    <td
                                        className="px-5 py-4 text-label-sm text-sub-600"
                                        colSpan={15}
                                    >
                                        Loading team…
                                    </td>
                                </tr>
                            ) : null}
                            {users.map((user) => {
                                const used = user.used_tokens ?? 0;
                                const limit = user.token_limit ?? 0;
                                const remaining = Math.max(0, limit - used);
                                return (
                                    <tr
                                        key={user.username}
                                        className="text-label-sm"
                                    >
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
                                                    user.username ===
                                                        currentUsername ||
                                                    (user.org_role === "owner" &&
                                                        ownerCount <= 1)
                                                }
                                                onChange={(role) =>
                                                    void changeRole(
                                                        user.username,
                                                        role
                                                    )
                                                }
                                            />
                                        </td>
                                        <td className="px-5 py-4 tabular-nums text-sub-600">
                                            {fmt.format(used)}
                                        </td>
                                        <td className="px-5 py-4 tabular-nums text-sub-600">
                                            {fmt.format(limit)}
                                        </td>
                                        <td className="px-5 py-4 tabular-nums text-sub-600">
                                            {fmt.format(remaining)}
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
                                                        void deactivate(
                                                            user.username
                                                        ).then((result) => {
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
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};

export default LiveTeamPage;
