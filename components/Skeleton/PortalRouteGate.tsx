"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type Props = {
    skeleton: ReactNode;
    children: ReactNode;
    durationMs?: number;
};

export default function PortalRouteGate({
    skeleton,
    children,
    durationMs = 450,
}: Props) {
    const pathname = usePathname();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        const id = window.setTimeout(() => setLoading(false), durationMs);
        return () => window.clearTimeout(id);
    }, [pathname, durationMs]);

    if (loading) return <>{skeleton}</>;
    return <>{children}</>;
}
