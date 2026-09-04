"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import LayoutLogin from "@/components/LayoutLogin";
import Button from "@/components/Button";
import Field from "@/components/Field";
import { useAuth } from "@/context/AuthContext";
import { homeUrlForRole, signInUrl } from "@/lib/auth/hosts";
import { readSharedItem, SIGNED_OUT_KEY } from "@/lib/auth/sharedStorage";
import { saveMfaChallenge } from "@/lib/coair/liveLogin";

function hasSignedOutMarker(): boolean {
    if (typeof window === "undefined") return false;
    return (
        readSharedItem(SIGNED_OUT_KEY) === "1" ||
        sessionStorage.getItem(SIGNED_OUT_KEY) === "1"
    );
}

const AdminSignInPage = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const signedOut = searchParams.get("signedOut") === "1";
    const { session, ready, signIn, signOut } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    /** After logout, do not bounce into /admin until the user submits this form. */
    const allowAutoEnter = useRef(false);

    useEffect(() => {
        if (!signedOut) return;
        let cancelled = false;
        void (async () => {
            await signOut();
            if (!cancelled) {
                router.replace("/admin/sign-in");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [signedOut, signOut, router]);

    useEffect(() => {
        if (!ready || !session || signedOut) return;
        if (hasSignedOutMarker() && !allowAutoEnter.current) {
            return;
        }
        if (session.role === "super_admin") {
            router.replace("/admin");
            return;
        }
        window.location.assign(homeUrlForRole(session.role));
    }, [ready, session, signedOut, router]);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setError("");
        setSubmitting(true);
        try {
            const result = await signIn(email, password);
            if (!result.ok && result.mfa) {
                saveMfaChallenge({
                    mfaToken: result.mfaToken,
                    debugCode: result.debugCode,
                    username: result.username,
                    portal: "admin",
                });
                router.push("/admin/enter-code");
                return;
            }
            if (!result.ok) {
                setError(result.error);
                return;
            }
            if (result.session.role !== "super_admin") {
                await signOut();
                setError(
                    "This portal is for platform super admins only. Company accounts use the workspace login."
                );
                return;
            }
            // Password-only success should not happen when API MFA is on;
            // still allow if API ever returns a full session.
            allowAutoEnter.current = true;
            router.replace("/admin");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <LayoutLogin
            title="Sign in to Super Admin"
            description={
                <>
                    Company or team account?{" "}
                    <Link className="text-blue-500" href={signInUrl()}>
                        Use workspace login
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
                        autoComplete="current-password"
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
                <p className="mt-5 text-center text-label-sm text-sub-600">
                    After password, we email a 6-digit security code.
                </p>
            </div>
        </LayoutLogin>
    );
};

export default AdminSignInPage;
