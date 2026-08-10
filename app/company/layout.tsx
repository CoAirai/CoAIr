"use client";

import CompanyLayout from "@/components/Company/CompanyLayout";
import RequireAuth from "@/components/Auth/RequireAuth";
import RequireCheckoutComplete from "@/components/Auth/RequireCheckoutComplete";
import { CompanyDataProvider } from "@/context/CompanyDataContext";

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <RequireAuth role="company_admin">
            <RequireCheckoutComplete>
                <CompanyDataProvider>
                    <CompanyLayout>{children}</CompanyLayout>
                </CompanyDataProvider>
            </RequireCheckoutComplete>
        </RequireAuth>
    );
}
