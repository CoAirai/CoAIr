import { Suspense } from "react";
import { OnboardingCheckoutSkeleton } from "@/components/Skeleton/sections";
import CheckoutPage from "@/templates/Onboarding/CheckoutPage";

export default function Page() {
    return (
        <Suspense
            fallback={<OnboardingCheckoutSkeleton />}
        >
            <CheckoutPage />
        </Suspense>
    );
}
