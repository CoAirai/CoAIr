"use client";

import AdminLayout from "@/components/Admin/AdminLayout";
import RequireAuth from "@/components/Auth/RequireAuth";

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <RequireAuth role="super_admin">
            <AdminLayout>{children}</AdminLayout>
        </RequireAuth>
    );
}
