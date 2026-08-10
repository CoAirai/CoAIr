"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LayoutLogin from "@/components/LayoutLogin";
import Button from "@/components/Button";
import Field from "@/components/Field";
import { useAuth } from "@/context/AuthContext";
import { useAdminData } from "@/context/AdminDataContext";
import { postLoginPath } from "@/lib/auth/postLoginPath";

const SignInPage = () => {
    const router = useRouter();
    const { session, ready, signIn } = useAuth();
    const { companies } = useAdminData();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        if (!ready || !session) return;
        router.replace(postLoginPath(session, companies));
    }, [ready, session, router, companies]);

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        const result = signIn(email, password);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        router.replace(postLoginPath(result.session, companies));
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
                        placeholder="Work email"
                        value={email}
                        type="email"
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
                    >
                        Sign in
                    </Button>
                </form>
                <div className="mt-5 rounded-2xl bg-weak-50 px-4 py-3 text-label-sm text-sub-600">
                    <p className="mb-1 font-medium text-strong-950">
                        Demo workspaces
                    </p>
                    <p>admin@coair.ai — Super Admin</p>
                    <p>ada@acmebuilders.com — Company admin</p>
                    <p>elena@betalabs.io — Demo company admin</p>
                    <p>ben.carter@acmebuilders.com — Member</p>
                    <p className="mt-1">
                        Approved access requests sign in with the same email,
                        then choose a package.
                    </p>
                    <p className="mt-1">Any non-empty password works.</p>
                </div>
                <div className="mt-5 text-center">
                    <Link
                        className="text-label-sm text-blue-500 transition-colors hover:text-blue-700"
                        href="/auth/forgot-password"
                    >
                        Forgot password?
                    </Link>
                </div>
            </div>
        </LayoutLogin>
    );
};

export default SignInPage;
