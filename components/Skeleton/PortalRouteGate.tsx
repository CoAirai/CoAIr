"use client";

import type { ReactNode } from "react";

type Props = {
    skeleton: ReactNode;
    children: ReactNode;
    durationMs?: number;
};

export default function PortalRouteGate({ children }: Props) {
    return <>{children}</>;
}
