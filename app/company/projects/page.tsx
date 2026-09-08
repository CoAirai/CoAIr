"use client";

import CompanySourceGate from "@/components/Company/CompanySourceGate";
import LiveProjectsPage from "@/templates/Company/LiveProjectsPage";

export default function Page() {
    return (
        <CompanySourceGate
            live={<LiveProjectsPage />}
            mock={
                <p className="text-label-sm text-sub-600">
                    Projects are available on the live company portal.
                </p>
            }
        />
    );
}
