"use client";

import AdminSourceGate from "@/components/Admin/AdminSourceGate";
import LiveUsersPage from "@/templates/Admin/LiveUsersPage";
import UsersPage from "@/templates/Admin/UsersPage";

export default function Page() {
    return (
        <AdminSourceGate live={<LiveUsersPage />} mock={<UsersPage />} />
    );
}
