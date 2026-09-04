"use client";

import type { ReactNode } from "react";
import { Skeleton } from "boneyard-js/react";

type Props = {
    name: string;
    loading: boolean;
    fixture: ReactNode;
    children: ReactNode;
    className?: string;
};

/** In-page boneyard wrapper for data-fetch loading (tables, charts, lists). */
export default function DataSkeleton({
    name,
    loading,
    fixture,
    children,
    className,
}: Props) {
    return (
        <Skeleton
            name={name}
            loading={loading}
            animate="shimmer"
            transition
            select="viewport"
            className={className}
            fixture={fixture}
            fallback={fixture}
        >
            {children}
        </Skeleton>
    );
}
