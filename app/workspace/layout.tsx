"use client";

import { Suspense } from "react";
import RequireCheckoutComplete from "@/components/Auth/RequireCheckoutComplete";
import RequireCompanySession from "@/components/Auth/RequireCompanySession";
import { WorkspaceHubSkeleton } from "@/components/Skeleton/portals";

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <RequireCompanySession>
            <RequireCheckoutComplete>
                <Suspense fallback={<WorkspaceHubSkeleton />}>
                    {children}
                </Suspense>
            </RequireCheckoutComplete>
        </RequireCompanySession>
    );
}
