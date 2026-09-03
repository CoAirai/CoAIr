"use client";

import CompanySourceGate from "@/components/Company/CompanySourceGate";
import LiveUsagePage from "@/templates/Company/LiveUsagePage";
import UsagePage from "@/templates/Company/UsagePage";

export default function Page() {
    return (
        <CompanySourceGate live={<LiveUsagePage />} mock={<UsagePage />} />
    );
}
