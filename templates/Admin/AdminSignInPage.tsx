"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "@/components/Image";
import Button from "@/components/Button";
import Field from "@/components/Field";
import { useAuth } from "@/context/AuthContext";
import { adminOrigin, homeUrlForRole, signInUrl } from "@/lib/auth/hosts";

const AdminSignInPage = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const signedOut = searchParams.get("signedOut") === "1";
    const { session, ready, signIn, signOut } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!signedOut) return;
        void signOut();
    }, [signedOut, signOut]);

    useEffect(() => {
        if (!ready || signedOut || !session) return;
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
            if (!result.ok && "mfa" in result && result.mfa) {
                setError(
                    "MFA is not supported on the admin portal yet. Disable MFA for this account or contact support."
                );
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
            router.replace("/admin");
        } finally {
            setSubmitting(false);
        }
    };

    const hostLabel =
        adminOrigin().replace(/^https?:\/\//, "") || "admin.coair.ai";

    return (
        <div className="flex min-h-screen items-center justify-center bg-weak-50 px-6 py-10">
            <div className="w-full max-w-md rounded-3xl border border-stroke-soft-200 bg-white-0 p-8 shadow-[0_0_1.25rem_0_rgba(0,0,0,0.03)]">
                <Image
                    className="mb-6 h-9 w-auto rounded-xl object-contain opacity-100"
                    src="/images/coair-logo.png"
                    width={120}
                    height={36}
                    alt="COAir"
                />
                <p className="text-[11px] uppercase tracking-[0.18em] text-soft-400">
                    Platform control
                </p>
                <h1 className="mt-2 text-h4 text-strong-950">Super Admin sign in</h1>
                <p className="mt-2 text-label-sm text-sub-600">
                    Sign in to manage companies, packages, and platform ops on {hostLabel}.
                </p>

                <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
                    <Field
                        placeholder="Super admin email"
                        value={email}
                        type="email"
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
                        {submitting ? "Signing in…" : "Sign in to admin"}
                    </Button>
                </form>

                <p className="mt-6 text-center text-label-sm text-sub-600">
                    Company user?{" "}
                    <Link
                        className="text-blue-500 hover:text-blue-700"
                        href={signInUrl()}
                    >
                        Use the workspace login
                    </Link>
                </p>
            </div>
        </div>
    );
};

export default AdminSignInPage;
