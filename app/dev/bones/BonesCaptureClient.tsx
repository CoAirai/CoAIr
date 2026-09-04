"use client";

import {
    AdminContentSkeleton,
    AdminPortalSkeleton,
    ChatPortalSkeleton,
    CompanyContentSkeleton,
    CompanyPortalSkeleton,
    CompanyTeamTableSkeleton,
    ModulePortalSkeleton,
    WorkspaceHubSkeleton,
} from "@/components/Skeleton/portals";

/**
 * Capture surface for `npx boneyard-js build`.
 * Mounts every named portal skeleton so the CLI can snapshot fixtures.
 */
export default function BonesCaptureClient() {
    return (
        <div className="space-y-16 bg-weak-50 p-6">
            <section>
                <h2 className="mb-4 text-label-md text-sub-600">admin-content</h2>
                <AdminContentSkeleton loading={false} />
            </section>
            <section>
                <h2 className="mb-4 text-label-md text-sub-600">company-content</h2>
                <CompanyContentSkeleton loading={false} />
            </section>
            <section>
                <h2 className="mb-4 text-label-md text-sub-600">admin-portal</h2>
                <AdminPortalSkeleton loading={false} />
            </section>
            <section>
                <h2 className="mb-4 text-label-md text-sub-600">company-portal</h2>
                <CompanyPortalSkeleton loading={false} />
            </section>
            <section>
                <h2 className="mb-4 text-label-md text-sub-600">workspace-hub</h2>
                <WorkspaceHubSkeleton loading={false} />
            </section>
            <section>
                <h2 className="mb-4 text-label-md text-sub-600">chat-portal</h2>
                <ChatPortalSkeleton loading={false} />
            </section>
            <section>
                <h2 className="mb-4 text-label-md text-sub-600">module-portal</h2>
                <ModulePortalSkeleton loading={false} />
            </section>
            <section>
                <h2 className="mb-4 text-label-md text-sub-600">
                    company-team-table
                </h2>
                <CompanyTeamTableSkeleton loading={false} />
            </section>
        </div>
    );
}
