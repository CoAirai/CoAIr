"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Switch from "@/components/Switch";
import Button from "@/components/Button";
import Field from "@/components/Field";
import { useAuth } from "@/context/AuthContext";
import { redirectToSignInAfterLogout } from "@/lib/auth/portalNav";
import { updateMyProfile } from "@/lib/coair/org";
import { readMfaEnabled, writeMfaEnabled } from "@/lib/settings/localPrefs";

type Props = {
    changePassword?: (
        current: string,
        next: string
    ) =>
        | { ok: boolean; error?: string }
        | Promise<{ ok: boolean; error?: string }>;
};

const Security = ({ changePassword }: Props) => {
    const router = useRouter();
    const { session, signOut } = useAuth();
    const [authentication, setAuthentication] = useState(false);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loggingOut, setLoggingOut] = useState(false);

    useEffect(() => {
        setAuthentication(readMfaEnabled());
    }, []);

    const onToggleMfa = async (checked: boolean) => {
        setAuthentication(checked);
        writeMfaEnabled(checked);
        const token = session?.accessToken;
        if (token && session?.source === "live") {
            try {
                await updateMyProfile(token, { mfa_enabled: checked });
            } catch {
                /* local preference still saved */
            }
        }
    };

    const onSubmitPassword = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!changePassword) return;

        if (newPassword !== confirmPassword) {
            setError("New passwords do not match");
            setSuccess(null);
            return;
        }

        const result = await Promise.resolve(
            changePassword(currentPassword, newPassword)
        );
        if (!result.ok) {
            setError(result.error ?? "Unable to change password");
            setSuccess(null);
            return;
        }

        setError(null);
        setSuccess("Password updated successfully");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
    };

    const onLogoutAll = async () => {
        setLoggingOut(true);
        try {
            await signOut();
            redirectToSignInAfterLogout(router);
        } finally {
            setLoggingOut(false);
        }
    };

    return (
        <div className="">
            {changePassword && (
                <form
                    onSubmit={onSubmitPassword}
                    className="mb-3 pb-3 border-b border-stroke-soft-200"
                >
                    <div className="mb-3">
                        <div className="text-label-md">Change password</div>
                        <div className="text-sub-600">
                            Update your account password.
                        </div>
                    </div>
                    <Field
                        className="mb-3"
                        label="Current password"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                        isSmall
                    />
                    <Field
                        className="mb-3"
                        label="New password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                        isSmall
                    />
                    <Field
                        className="mb-3"
                        label="Confirm new password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                        isSmall
                    />
                    <div className="flex flex-wrap items-center gap-3">
                        <Button
                            type="submit"
                            className="!h-10 !rounded-[0.625rem]"
                            isBlue
                        >
                            Update password
                        </Button>
                        {success && (
                            <p className="text-label-sm text-green-600">
                                {success}
                            </p>
                        )}
                        {error && (
                            <p className="text-label-sm text-red-500">
                                {error}
                            </p>
                        )}
                    </div>
                </form>
            )}
            <div className="flex justify-between gap-6 mb-3 pb-3 border-b border-stroke-soft-200">
                <div className="max-w-101">
                    <div className="text-label-md">
                        Multi-factor authentication
                    </div>
                    <div className="text-sub-600">
                        Prefer an extra security challenge when logging in. Your
                        preference is saved for this account.
                    </div>
                </div>
                <Switch
                    checked={authentication}
                    onChange={(checked) => void onToggleMfa(checked)}
                    isSmall
                />
            </div>
            <div className="flex justify-between gap-6 max-md:flex-col max-md:gap-3">
                <div className="max-w-101">
                    <div className="text-label-md">Log out of all devices</div>
                    <div className="text-sub-600">
                        Ends your current session on this browser and clears
                        shared portal sign-in. Sign in again on other devices if
                        needed.
                    </div>
                </div>
                <Button
                    type="button"
                    className="shrink-0 !h-10 !rounded-[0.625rem] !bg-weak-50"
                    isStroke
                    disabled={loggingOut}
                    onClick={() => void onLogoutAll()}
                >
                    {loggingOut ? "Signing out…" : "Log out all"}
                </Button>
            </div>
        </div>
    );
};

export default Security;
