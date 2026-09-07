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

/**
 * In-page boneyard wrapper for data-fetch loading (tables, charts, lists).
 *
 * Children are wrapped in a stacked column so sibling panels keep vertical
 * rhythm. Boneyard's Skeleton applies `className` to an outer shell whose
 * direct child is a content wrapper — so gap on that shell never spaces
 * the page sections themselves.
 */
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
            <div className="flex w-full flex-col gap-8">{children}</div>
        </Skeleton>
    );
}
