"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { OnboardingCheckoutSkeleton } from "@/components/Skeleton/sections";
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
        return <OnboardingCheckoutSkeleton />;
    }

    return <>{children}</>;
}
