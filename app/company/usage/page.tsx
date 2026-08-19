"use client";

import { useAuth } from "@/context/AuthContext";
import LiveUsagePage from "@/templates/Company/LiveUsagePage";
import UsagePage from "@/templates/Company/UsagePage";

export default function Page() {
    const { session } = useAuth();
    if (session?.source === "live") {
        return <LiveUsagePage />;
    }
    return <UsagePage />;
}
