"use client";

import { useAuth } from "@/context/AuthContext";
import LiveBillingPage from "@/templates/Company/LiveBillingPage";
import BillingPage from "@/templates/Company/BillingPage";

export default function Page() {
    const { session } = useAuth();
    if (session?.source === "live") {
        return <LiveBillingPage />;
    }
    return <BillingPage />;
}
