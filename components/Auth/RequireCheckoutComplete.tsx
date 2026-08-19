"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { WorkspaceHubSkeleton } from "@/components/Skeleton/portals";

export default function RequireCheckoutComplete({
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
        if (!ready || !session?.companyId) return;
        if (needsCheckout) {
            router.replace("/onboarding/plans");
        }
    }, [ready, session, needsCheckout, router]);

    if (session?.companyId && needsCheckout) {
        return <WorkspaceHubSkeleton />;
    }

    return <>{children}</>;
}
