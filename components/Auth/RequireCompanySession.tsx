"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { homeUrlForRole } from "@/lib/auth/hosts";
import { portalNavigate, redirectToSignIn } from "@/lib/auth/portalNav";
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
    const isLive = session?.source === "live";

    useEffect(() => {
        if (!ready) return;
        if (!session) {
            redirectToSignIn(router);
            return;
        }
        if (isLive) return;
        if (!session.companyId || session.role === "super_admin") {
            portalNavigate(router, homeUrlForRole(session.role));
        }
    }, [ready, session, router, isLive]);

    if (!ready || !session) {
        return <WorkspaceGateSkeleton pathname={pathname} />;
    }

    if (!isLive && !session.companyId) {
        return <WorkspaceGateSkeleton pathname={pathname} />;
    }

    return <>{children}</>;
}

function WorkspaceGateSkeleton({ pathname }: { pathname: string }) {
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
