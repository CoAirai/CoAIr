"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { homePathForRole } from "@/lib/auth/resolveLogin";

export default function OnboardingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { session, ready } = useAuth();
    const { companies } = useAdminData();
    const router = useRouter();
    const company = companies.find((entry) => entry.id === session?.companyId);

    useEffect(() => {
        if (!ready) return;
        if (!session) {
            router.replace("/auth/sign-in");
            return;
        }
        if (!session.companyId) {
            router.replace(homePathForRole(session.role));
            return;
        }
        if (!company?.needsCheckout) {
            router.replace(homePathForRole(session.role));
        }
    }, [ready, session, company, router]);

    if (!ready || !session?.companyId || !company?.needsCheckout) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-weak-50 text-label-md text-sub-600">
                Preparing checkout…
            </div>
        );
    }

    return <>{children}</>;
}
