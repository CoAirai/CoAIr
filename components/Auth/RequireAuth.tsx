"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { type SessionRole } from "@/lib/auth/resolveLogin";
import { homeUrlForRole } from "@/lib/auth/hosts";
import { portalNavigate, redirectToSignIn } from "@/lib/auth/portalNav";
import {
    AdminPortalSkeleton,
    CompanyPortalSkeleton,
} from "@/components/Skeleton/portals";

type Props = {
    role: Exclude<SessionRole, "member">;
    children: React.ReactNode;
};

export default function RequireAuth({ role, children }: Props) {
    const { session, ready } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!ready) return;
        if (!session) {
            redirectToSignIn(router);
            return;
        }
        if (session.role !== role) {
            portalNavigate(router, homeUrlForRole(session.role));
        }
    }, [ready, session, role, router]);

    if (!ready || !session || session.role !== role) {
        return role === "super_admin" ? (
            <AdminPortalSkeleton />
        ) : (
            <CompanyPortalSkeleton />
        );
    }

    return <>{children}</>;
}
