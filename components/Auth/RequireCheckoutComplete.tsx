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

    useEffect(() => {
        if (!ready || !session?.companyId) return;
        if (company?.needsCheckout) {
            router.replace("/onboarding/plans");
        }
    }, [ready, session, company, router]);

    if (session?.companyId && company?.needsCheckout) {
        return <WorkspaceHubSkeleton />;
    }

    return <>{children}</>;
}
