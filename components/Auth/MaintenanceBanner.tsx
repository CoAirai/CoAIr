"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { readPlatformStatus } from "@/lib/coair/ops";

const MaintenanceBanner = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const live = session?.source === "live" && Boolean(token);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!live) {
            setMessage(null);
            return;
        }
        let cancelled = false;
        void readPlatformStatus(token)
            .then((status) => {
                if (cancelled) return;
                setMessage(
                    status.maintenance_mode
                        ? status.maintenance_message || "Maintenance mode is on"
                        : null
                );
            })
            .catch(() => {
                if (!cancelled) setMessage(null);
            });
        return () => {
            cancelled = true;
        };
    }, [live, token]);

    if (!message) return null;

    return (
        <div className="mb-3.5 flex shrink-0 items-center rounded-2xl border-b border-stroke-soft-200 bg-orange-500/10 px-4 py-2 text-label-sm text-strong-950">
            <span>Maintenance mode active — {message}</span>
        </div>
    );
};

export default MaintenanceBanner;
