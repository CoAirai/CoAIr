"use client";

import { Skeleton } from "boneyard-js/react";
import {
    AdminContentFixture,
    AdminPortalFixture,
    ChatPortalFixture,
    CompanyContentFixture,
    CompanyPortalFixture,
    ModulePortalFixture,
    WorkspaceHubFixture,
} from "./fixtures";

type PortalSkeletonProps = {
    /** Override loading for capture / demos. Defaults to true (gate/loading use). */
    loading?: boolean;
};

function PortalSkeleton({
    name,
    loading = true,
    fixture,
    className,
}: {
    name: string;
    loading?: boolean;
    fixture: React.ReactNode;
    className?: string;
}) {
    return (
        <Skeleton
            name={name}
            loading={loading}
            animate="shimmer"
            transition
            select="viewport"
            className={className}
            fixture={fixture}
            // Soft safety if registry is missing on a fresh clone before CLI capture.
            fallback={fixture}
        >
            {fixture}
        </Skeleton>
    );
}

export function AdminContentSkeleton({ loading }: PortalSkeletonProps = {}) {
    return (
        <PortalSkeleton
            name="admin-content"
            loading={loading}
            fixture={<AdminContentFixture />}
        />
    );
}

export function CompanyContentSkeleton({ loading }: PortalSkeletonProps = {}) {
    return (
        <PortalSkeleton
            name="company-content"
            loading={loading}
            fixture={<CompanyContentFixture />}
        />
    );
}

export function AdminPortalSkeleton({ loading }: PortalSkeletonProps = {}) {
    return (
        <PortalSkeleton
            name="admin-portal"
            loading={loading}
            fixture={<AdminPortalFixture />}
            className="min-h-screen"
        />
    );
}

export function CompanyPortalSkeleton({ loading }: PortalSkeletonProps = {}) {
    return (
        <PortalSkeleton
            name="company-portal"
            loading={loading}
            fixture={<CompanyPortalFixture />}
            className="min-h-screen"
        />
    );
}

export function WorkspaceHubSkeleton({ loading }: PortalSkeletonProps = {}) {
    return (
        <PortalSkeleton
            name="workspace-hub"
            loading={loading}
            fixture={<WorkspaceHubFixture />}
            className="min-h-screen"
        />
    );
}

export function ChatPortalSkeleton({ loading }: PortalSkeletonProps = {}) {
    return (
        <PortalSkeleton
            name="chat-portal"
            loading={loading}
            fixture={<ChatPortalFixture />}
            className="min-h-screen"
        />
    );
}

export function ModulePortalSkeleton({ loading }: PortalSkeletonProps = {}) {
    return (
        <PortalSkeleton
            name="module-portal"
            loading={loading}
            fixture={<ModulePortalFixture />}
            className="min-h-screen"
        />
    );
}
