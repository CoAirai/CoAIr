"use client";

import { useAuth } from "@/context/AuthContext";
import LiveTeamPage from "@/templates/Company/LiveTeamPage";
import TeamPage from "@/templates/Company/TeamPage";

export default function Page() {
    const { session } = useAuth();
    if (session?.source === "live") {
        return <LiveTeamPage />;
    }
    return <TeamPage />;
}
