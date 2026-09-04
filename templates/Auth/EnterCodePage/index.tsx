"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import LayoutLogin from "@/components/LayoutLogin";
import Button from "@/components/Button";
import Field from "@/components/Field";
import { useAuth } from "@/context/AuthContext";
import { useAdminData } from "@/context/AdminDataContext";
import { adminOrigin, adminSignInUrl, signInUrl } from "@/lib/auth/hosts";
import { postLoginUrl } from "@/lib/auth/postLoginPath";
import { apiErrorMessage } from "@/lib/coair/commerce";
import {
    clearMfaChallenge,
    readMfaChallenge,
    sessionFromAccessToken,
    type MfaChallenge,
} from "@/lib/coair/liveLogin";
import { verifyMfa } from "@/lib/coair/ops";
import { showAuthDebugCodes } from "@/lib/coair/debugFlags";
import { writeTrustedDeviceToken } from "@/lib/coair/trustedDevice";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

const CODE_LENGTH = 6;

function maskUsername(value: string) {
    const clean = (value || "").trim();
    if (!clean.includes("@")) return clean;
    const [local, domain] = clean.split("@");
    if (!domain) return "***";
    return `${local.slice(0, 1)}***@${domain}`;
}

type Props = {
    /** Prefer admin portal redirect after MFA when set. */
    portalHint?: "admin" | "workspace";
};

const EnterCodePage = ({ portalHint }: Props) => {
    const { applySession } = useAuth();
    const { companies } = useAdminData();
    const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
    const [code, setCode] = useState("");
    const [rememberDevice, setRememberDevice] = useState(true);
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        setChallenge(readMfaChallenge());
    }, []);

    const isAdminPortal =
        portalHint === "admin" || challenge?.portal === "admin";

    const handleMfa = async (event: FormEvent) => {
        event.preventDefault();
        if (!challenge) return;
        const cleaned = code.replace(/\D/g, "");
        if (cleaned.length !== CODE_LENGTH) {
            setError(`Enter the ${CODE_LENGTH}-digit code from your email`);
            return;
        }
        setSubmitting(true);
        setError("");
        try {
            const verified = await verifyMfa(challenge.mfaToken, cleaned, {
                rememberDevice: !isAdminPortal && rememberDevice,
            });
            clearMfaChallenge();
            if (verified.device_token && verified.user?.username) {
                writeTrustedDeviceToken(
                    verified.user.username,
                    verified.device_token
                );
            }
            if (verified.refresh_token) {
                await getSupabaseBrowser()?.auth.setSession({
                    access_token: verified.access_token,
                    refresh_token: verified.refresh_token,
                });
            }
            const session = await sessionFromAccessToken(
                verified.access_token,
                verified.user
            );
            applySession(session);
            const wantAdmin =
                isAdminPortal || session.role === "super_admin";
            if (wantAdmin && session.role === "super_admin") {
                const origin = adminOrigin();
                window.location.assign(origin ? `${origin}/admin` : "/admin");
                return;
            }
            window.location.assign(postLoginUrl(session, companies));
        } catch (err) {
            setError(apiErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    const backHref = isAdminPortal ? adminSignInUrl() : signInUrl();

    if (challenge) {
        return (
            <LayoutLogin
                title="Enter security code"
                description={
                    <>
                        We emailed a {CODE_LENGTH}-digit code for{" "}
                        <span className="text-strong-950">
                            {maskUsername(challenge.username)}
                        </span>
                        . Enter it to finish signing in.
                    </>
                }
            >
                <form onSubmit={(event) => void handleMfa(event)}>
                    <Field
                        className="mb-5"
                        classInput="h-14 !px-4 text-center !text-h5 tracking-[0.35em]"
                        placeholder="000000"
                        value={code}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        autoFocus
                        maxLength={CODE_LENGTH}
                        onChange={(event) => {
                            setCode(
                                event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH)
                            );
                        }}
                        required
                    />
                    {showAuthDebugCodes() && challenge.debugCode ? (
                        <p className="mb-4 text-center text-label-xs text-amber-600">
                            Dev code: {challenge.debugCode}
                        </p>
                    ) : null}
                    {!isAdminPortal ? (
                        <label className="mb-4 flex items-center gap-2 text-label-sm text-sub-600">
                            <input
                                type="checkbox"
                                checked={rememberDevice}
                                onChange={(event) =>
                                    setRememberDevice(event.target.checked)
                                }
                            />
                            Remember this device for 30 days
                        </label>
                    ) : (
                        <p className="mb-4 text-center text-label-xs text-sub-600">
                            Super Admin always requires a new email code.
                        </p>
                    )}
                    {error ? (
                        <p className="mb-3 text-label-sm text-red-500">{error}</p>
                    ) : null}
                    <Button
                        className="w-full !h-12 !rounded-xl"
                        isBlue
                        type="submit"
                        disabled={submitting}
                    >
                        {submitting ? "Verifying…" : "Verify & continue"}
                    </Button>
                    <div className="mt-5 text-center">
                        <Link
                            className="text-label-sm text-blue-500 transition-colors hover:text-blue-700"
                            href={backHref}
                        >
                            Back to sign in
                        </Link>
                    </div>
                </form>
            </LayoutLogin>
        );
    }

    return (
        <LayoutLogin
            title="Enter security code"
            description={
                <>
                    Sign in first — we&apos;ll email you a {CODE_LENGTH}-digit
                    security code.
                </>
            }
        >
            <div className="text-center">
                <Button
                    className="w-full !h-12 !rounded-xl"
                    isBlue
                    as="link"
                    href={backHref}
                >
                    Back to sign in
                </Button>
            </div>
        </LayoutLogin>
    );
};

export default EnterCodePage;
