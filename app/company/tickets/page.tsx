"use client";

import CompanySourceGate from "@/components/Company/CompanySourceGate";
import LiveTicketsPage from "@/templates/Company/LiveTicketsPage";
import TicketsPage from "@/templates/Company/TicketsPage";

export default function Page() {
    return (
        <CompanySourceGate
            live={<LiveTicketsPage />}
            mock={<TicketsPage />}
        />
    );
}
