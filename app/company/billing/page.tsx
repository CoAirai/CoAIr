"use client";

import CompanySourceGate from "@/components/Company/CompanySourceGate";
import LiveBillingPage from "@/templates/Company/LiveBillingPage";
import BillingPage from "@/templates/Company/BillingPage";

export default function Page() {
    return (
        <CompanySourceGate
            live={<LiveBillingPage />}
            mock={<BillingPage />}
        />
    );
}
