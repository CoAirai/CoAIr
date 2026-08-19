import { Suspense } from "react";
import HubPage from "@/templates/Workspace/HubPage";
import { WorkspaceHubSkeleton } from "@/components/Skeleton/portals";

export default function Page() {
    return (
        <Suspense fallback={<WorkspaceHubSkeleton />}>
            <HubPage />
        </Suspense>
    );
}
