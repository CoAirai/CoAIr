"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { CompanyContentSkeleton } from "@/components/Skeleton/portals";

type Props = {
    live: ReactNode;
    mock: ReactNode;
};

/** Wait for auth before choosing live vs demo company pages (avoids demo flash). */
const CompanySourceGate = ({ live, mock }: Props) => {
    const { session, ready } = useAuth();
    if (!ready) {
        return <CompanyContentSkeleton />;
    }
    if (session?.source === "live") {
        return live;
    }
    return mock;
};

export default CompanySourceGate;
