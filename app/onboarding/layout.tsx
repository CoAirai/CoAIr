"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { homeUrlForRole, homeUrlForSession } from "@/lib/auth/hosts";
import { portalNavigate, redirectToSignIn } from "@/lib/auth/portalNav";

export default function OnboardingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { session, ready } = useAuth();
    const { companies } = useAdminData();
    const router = useRouter();
    const company = companies.find((entry) => entry.id === session?.companyId);
    const needsCheckout =
        session?.source === "live"
            ? Boolean(session.needsCheckout)
            : Boolean(company?.needsCheckout);

    useEffect(() => {
        if (!ready) return;
        if (!session) {
            redirectToSignIn(router);
            return;
        }
        if (!session.companyId) {
            portalNavigate(router, homeUrlForRole(session.role));
            return;
        }
        if (!needsCheckout) {
            portalNavigate(
                router,
                session.source === "live"
                    ? homeUrlForSession(session)
                    : homeUrlForRole(session.role)
            );
        }
    }, [ready, session, needsCheckout, router]);

    if (!ready || !session?.companyId || !needsCheckout) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-weak-50 text-label-md text-sub-600">
                Preparing checkout…
            </div>
        );
    }

    return <>{children}</>;
}
