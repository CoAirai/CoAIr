"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LayoutLogin from "@/components/LayoutLogin";
import Button from "@/components/Button";
import Field from "@/components/Field";
import { useAdminData } from "@/context/AdminDataContext";

const SignUpPage = () => {
    const router = useRouter();
    const { requestCompanyAccess } = useAdminData();
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [company, setCompany] = useState("");
    const [error, setError] = useState("");
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        const result = requestCompanyAccess({
            fullName,
            email,
            companyName: company,
        });
        if (!result.ok) {
            setError(result.error ?? "Unable to submit request");
            return;
        }
        setError("");
        setSubmitted(true);
        window.setTimeout(() => {
            router.push("/auth/sign-in");
        }, 1600);
    };

    return (
        <LayoutLogin
            title="Request COAir access"
            description={
                <>
                    Already on a workspace?{" "}
                    <Link className="text-blue-500" href="/auth/sign-in">
                        Sign in
                    </Link>
                </>
            }
        >
            <div>
                {submitted ? (
                    <div className="surface-panel px-4 py-5 text-center text-label-sm text-sub-600">
                        <p className="font-medium text-strong-950">
                            Request sent to Super Admin
                        </p>
                        <p className="mt-2 leading-relaxed">
                            It appears under Tenants → Companies. Taking you to
                            sign in…
                        </p>
                    </div>
                ) : (
                    <form className="flex flex-col gap-4.5" onSubmit={handleSubmit}>
                        <Field
                            placeholder="Full name"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            required
                        />
                        <Field
                            placeholder="Work email"
                            value={email}
                            type="email"
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                        <Field
                            placeholder="Company name"
                            value={company}
                            onChange={(e) => setCompany(e.target.value)}
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
                            Request access
                        </Button>
                    </form>
                )}
                <p className="mt-5 text-center text-label-sm text-sub-600">
                    Super Admin reviews requests on Companies, then invites the
                    owner with a package.
                </p>
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

export default SignUpPage;
