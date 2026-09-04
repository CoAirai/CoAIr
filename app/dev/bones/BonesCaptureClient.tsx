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
import { SECTION_SKELETON_CAPTURE } from "@/components/Skeleton/sections";

/**
 * Capture surface for `npx boneyard-js build`.
 * Mounts every named portal and shared section skeleton for CLI snapshots.
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
            {SECTION_SKELETON_CAPTURE.map((entry) => (
                <section key={entry.name}>
                    <h2 className="mb-4 text-label-md text-sub-600">
                        {entry.name}
                    </h2>
                    {entry.node}
                </section>
            ))}
        </div>
    );
}
