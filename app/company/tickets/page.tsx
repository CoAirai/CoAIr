"use client";

import { useAuth } from "@/context/AuthContext";
import LiveTicketsPage from "@/templates/Company/LiveTicketsPage";
import TicketsPage from "@/templates/Company/TicketsPage";

export default function Page() {
    const { session } = useAuth();
    if (session?.source === "live") {
        return <LiveTicketsPage />;
    }
    return <TicketsPage />;
}
