"use client";

import AdminSourceGate from "@/components/Admin/AdminSourceGate";
import LiveTokensPage from "@/templates/Admin/LiveTokensPage";
import TokensPage from "@/templates/Admin/TokensPage";

export default function Page() {
    return (
        <AdminSourceGate live={<LiveTokensPage />} mock={<TokensPage />} />
    );
}
