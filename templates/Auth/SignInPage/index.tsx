"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import LayoutLogin from "@/components/LayoutLogin";
import Button from "@/components/Button";
import Field from "@/components/Field";
import { useAuth } from "@/context/AuthContext";
import { useAdminData } from "@/context/AdminDataContext";
import { postLoginUrl } from "@/lib/auth/postLoginPath";
import { portalNavigate } from "@/lib/auth/portalNav";
import { MFA_CHALLENGE_KEY } from "@/lib/coair/liveLogin";

const SignInPage = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const signedOut = searchParams.get("signedOut") === "1";
    const { session, ready, signIn, signOut } = useAuth();
    const { companies } = useAdminData();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!signedOut) return;
        void signOut();
    }, [signedOut, signOut]);

    useEffect(() => {
        if (!ready || !session || signedOut) return;
        portalNavigate(router, postLoginUrl(session, companies));
    }, [ready, session, signedOut, companies, router]);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setError("");
        setSubmitting(true);
        try {
            const result = await signIn(email, password);
            if (!result.ok && result.mfa) {
                sessionStorage.setItem(
                    MFA_CHALLENGE_KEY,
                    JSON.stringify({
                        mfaToken: result.mfaToken,
                        debugCode: result.debugCode,
                        username: result.username,
                    })
                );
                router.push("/auth/enter-code");
                return;
            }
            if (!result.ok) {
                setError(result.error);
                return;
            }
            // Always hard-navigate to the role portal so login.coair.ai does not
            // soft-route into /admin (middleware would bounce that back to sign-in).
            const dest = postLoginUrl(result.session, companies);
            window.location.assign(dest);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <LayoutLogin
            title="Sign in to COAir"
            description={
                <>
                    New to the workspace?{" "}
                    <Link className="text-blue-500" href="/auth/sign-up">
                        Request access
                    </Link>
                </>
            }
        >
            <div>
                <form className="flex flex-col gap-4.5" onSubmit={handleSubmit}>
                    <Field
                        placeholder="Username or work email"
                        value={email}
                        type="text"
                        autoComplete="username"
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <Field
                        placeholder="Password"
                        value={password}
                        type="password"
                        onChange={(e) => setPassword(e.target.value)}
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
                        {submitting ? "Signing in…" : "Sign in"}
                    </Button>
                </form>
                <p className="mt-5 text-center">
                    <Link
                        className="text-label-sm text-blue-500 transition-colors hover:text-blue-700"
                        href="/auth/forgot-password"
                    >
                        Forgot password?
                    </Link>
                </p>
            </div>
        </LayoutLogin>
    );
};

export default SignInPage;
