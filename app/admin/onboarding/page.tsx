"use client";

import AdminSourceGate from "@/components/Admin/AdminSourceGate";
import LiveOnboardingPage from "@/templates/Admin/LiveOnboardingPage";
import OnboardingPage from "@/templates/Admin/OnboardingPage";

export default function Page() {
    return (
        <AdminSourceGate
            live={<LiveOnboardingPage />}
            mock={<OnboardingPage />}
        />
    );
}
