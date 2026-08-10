"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { homePathForRole, type SessionRole } from "@/lib/auth/resolveLogin";
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
            router.replace("/auth/sign-in");
            return;
        }
        if (session.role !== role) {
            router.replace(homePathForRole(session.role));
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
