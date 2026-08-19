"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LayoutLogin from "@/components/LayoutLogin";
import Button from "@/components/Button";
import { isApiUnreachable } from "@/lib/coair/client";
import { RESET_EMAIL_KEY, RESET_TOKEN_KEY } from "@/lib/coair/liveLogin";
import { forgotPassword } from "@/lib/coair/ops";
import { dispatchEmail } from "@/lib/email/dispatch";
import { isSupabaseAuthConfigured } from "@/lib/supabase/browser";

const CheckEmailPage = () => {
    const [status, setStatus] = useState("");
    const [sending, setSending] = useState(false);
    const [resetHref, setResetHref] = useState("/auth/sign-in");
    const [sandboxToken, setSandboxToken] = useState<string | null>(null);
    const supabaseAuth = isSupabaseAuthConfigured();

    useEffect(() => {
        if (supabaseAuth) {
            setResetHref("/auth/sign-in");
            return;
        }
        const token = sessionStorage.getItem(RESET_TOKEN_KEY);
        if (token) {
            setSandboxToken(token);
            setResetHref(`/auth/reset-password?token=${encodeURIComponent(token)}`);
        }
    }, [supabaseAuth]);

    const resend = async () => {
        const email = sessionStorage.getItem(RESET_EMAIL_KEY)?.trim();
        if (!email) {
            setStatus("Enter your email on the previous screen first.");
            return;
        }
        setSending(true);
        try {
            const result = await forgotPassword(email);
            if (result.reset_token) {
                sessionStorage.setItem(RESET_TOKEN_KEY, result.reset_token);
                setSandboxToken(result.reset_token);
                setResetHref(
                    `/auth/reset-password?token=${encodeURIComponent(result.reset_token)}`
                );
                setStatus(`If an account exists for ${email}, check your inbox for a reset link.`);
            } else {
                setStatus(`If an account exists for ${email}, check your inbox for a reset link.`);
            }
        } catch (error) {
            if (isApiUnreachable(error)) {
                await dispatchEmail({
                    kind: "password_reset",
                    to: email,
                    isResend: true,
                });
                setStatus(`If an account exists for ${email}, check your inbox for a reset link.`);
            } else {
                setStatus("Unable to resend right now.");
            }
        } finally {
            setSending(false);
        }
    };

    return (
        <LayoutLogin
            title="Check your email"
            description={
                <>
                    We sent a reset link to your inbox from COAir. Open it on this
                    device to set a new password.
                </>
            }
        >
            <>
                <Button
                    className="w-full !h-12 !rounded-xl"
                    isBlue
                    as="link"
                    href={resetHref}
                >
                    {sandboxToken ? "Set a new password" : "Back to sign in"}
                </Button>
                {sandboxToken ? (
                    <p className="mt-3 break-all text-center text-label-xs text-sub-600">
                        Sandbox reset token: {sandboxToken}
                    </p>
                ) : null}
                <button
                    type="button"
                    className="mt-3 w-full text-label-sm text-blue-500 hover:text-blue-700"
                    onClick={() => void resend()}
                    disabled={sending}
                >
                    {sending ? "Resending…" : "Resend email"}
                </button>
                {status ? (
                    <p className="mt-3 text-center text-label-xs text-sub-600">
                        {status}
                    </p>
                ) : null}
                <div className="mt-5 text-center">
                    <Link
                        className="text-label-sm text-blue-500 transition-colors hover:text-blue-700"
                        href="/auth/sign-in"
                    >
                        Back to sign in
                    </Link>
                </div>
            </>
        </LayoutLogin>
    );
};

export default CheckEmailPage;
