"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { homePathForRole } from "@/lib/auth/resolveLogin";
import {
    ChatPortalSkeleton,
    ModulePortalSkeleton,
    WorkspaceHubSkeleton,
} from "@/components/Skeleton/portals";

export default function RequireCompanySession({
    children,
}: {
    children: React.ReactNode;
}) {
    const { session, ready } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!ready) return;
        if (!session) {
            router.replace("/auth/sign-in");
            return;
        }
        if (!session.companyId || session.role === "super_admin") {
            router.replace(homePathForRole(session.role));
        }
    }, [ready, session, router]);

    if (!ready || !session?.companyId) {
        if (pathname.startsWith("/workspace/chat")) {
            return <ChatPortalSkeleton />;
        }
        if (
            pathname.startsWith("/workspace/chronology") ||
            pathname.startsWith("/workspace/forensic")
        ) {
            return <ModulePortalSkeleton />;
        }
        return <WorkspaceHubSkeleton />;
    }

    return <>{children}</>;
}
