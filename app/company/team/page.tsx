"use client";

import CompanySourceGate from "@/components/Company/CompanySourceGate";
import LiveTeamPage from "@/templates/Company/LiveTeamPage";
import TeamPage from "@/templates/Company/TeamPage";

export default function Page() {
    return (
        <CompanySourceGate live={<LiveTeamPage />} mock={<TeamPage />} />
    );
}
