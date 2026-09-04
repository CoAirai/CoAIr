import { Suspense } from "react";
import AcceptInvitePage from "@/templates/Auth/AcceptInvitePage";

export default function Page() {
    return (
        <Suspense fallback={null}>
            <AcceptInvitePage />
        </Suspense>
    );
}
