"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy route — company Settings now opens the shared user settings popup. */
export default function Page() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/company");
    }, [router]);

    return (
        <div className="flex min-h-[40vh] items-center justify-center text-label-sm text-sub-600">
            Opening settings…
        </div>
    );
}
