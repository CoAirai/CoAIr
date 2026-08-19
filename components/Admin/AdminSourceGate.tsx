"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";

type Props = {
    live: ReactNode;
    mock: ReactNode;
};

const AdminSourceGate = ({ live, mock }: Props) => {
    const { session, ready } = useAuth();
    if (!ready) {
        return <p className="text-label-sm text-sub-600">Loading…</p>;
    }
    if (session?.source === "live") {
        return live;
    }
    return mock;
};

export default AdminSourceGate;
