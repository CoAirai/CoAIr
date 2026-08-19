"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import LayoutLogin from "@/components/LayoutLogin";
import Button from "@/components/Button";
import Field from "@/components/Field";
import { apiErrorMessage } from "@/lib/coair/commerce";
import { RESET_TOKEN_KEY } from "@/lib/coair/liveLogin";
import { resetPassword } from "@/lib/coair/ops";
import {
    getSupabaseBrowser,
    isSupabaseAuthConfigured,
} from "@/lib/supabase/browser";

const ResetPasswordForm = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [token, setToken] = useState("");
    const [hasSupabaseSession, setHasSupabaseSession] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [ready, setReady] = useState(!isSupabaseAuthConfigured());

    useEffect(() => {
        const fromQuery = searchParams.get("token")?.trim();
        const stored = sessionStorage.getItem(RESET_TOKEN_KEY)?.trim();
        setToken(fromQuery || stored || "");

        const supabase = getSupabaseBrowser();
        if (!supabase) {
            setReady(true);
            return;
        }
        let cancelled = false;
        void supabase.auth.getSession().then(({ data }) => {
            if (cancelled) return;
            setHasSupabaseSession(Boolean(data.session));
            setReady(true);
        });
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === "PASSWORD_RECOVERY" || session) {
                setHasSupabaseSession(true);
            }
        });
        return () => {
            cancelled = true;
            data.subscription.unsubscribe();
        };
    }, [searchParams]);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setError("");
        if (newPassword.length < 6) {
            setError("Password must be at least 6 characters");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }
        setSubmitting(true);
        try {
            const supabase = getSupabaseBrowser();
            if (hasSupabaseSession && supabase) {
                const { error: updateError } = await supabase.auth.updateUser({
                    password: newPassword,
                });
                if (updateError) {
                    setError(updateError.message);
                    return;
                }
                await supabase.auth.signOut();
            } else if (token) {
                await resetPassword(token, newPassword);
                sessionStorage.removeItem(RESET_TOKEN_KEY);
            } else {
                setError(
                    "Open the link from your email on this device, then set a password."
                );
                return;
            }
            router.replace("/auth/sign-in");
        } catch (err) {
            setError(apiErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <LayoutLogin
            title="Set a new password"
            description={<>Choose a new password for your COAir account.</>}
        >
            <div className="">
                {!ready ? (
                    <p className="text-label-sm text-sub-600">Checking your reset link…</p>
                ) : (
                    <form className="flex flex-col gap-4.5" onSubmit={handleSubmit}>
                        <Field
                            placeholder="New password"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                        />
                        <Field
                            placeholder="Confirm password"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                        />
                        {error ? (
                            <p className="text-label-sm text-red-500">{error}</p>
                        ) : null}
                        <Button
                            className="w-full !h-12 !rounded-xl"
                            isBlue
                            type="submit"
                            disabled={submitting}
                        >
                            {submitting ? "Saving…" : "Save password"}
                        </Button>
                    </form>
                )}
                <div className="mt-5 text-center">
                    <Link
                        className="text-label-sm text-blue-500 transition-colors hover:text-blue-700"
                        href="/auth/sign-in"
                    >
                        Back to sign in
                    </Link>
                </div>
            </div>
        </LayoutLogin>
    );
};

const ResetPasswordPage = () => (
    <Suspense fallback={null}>
        <ResetPasswordForm />
    </Suspense>
);

export default ResetPasswordPage;
