"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FORENSIC_NAV_GROUPS } from "@/lib/forensic/nav";
import CaCredits from "./CaCredits";

const ForensicNav = () => {
    const pathname = usePathname();
    const router = useRouter();
    const activeGroupId = useMemo(() => {
        const match = FORENSIC_NAV_GROUPS.find((group) =>
            group.items.some((item) =>
                item.id === "intake"
                    ? pathname === "/workspace/forensic"
                    : pathname === item.href
            )
        );
        return match?.id ?? FORENSIC_NAV_GROUPS[0]?.id ?? "";
    }, [pathname]);
    const [openId, setOpenId] = useState(activeGroupId);

    useEffect(() => {
        if (activeGroupId) setOpenId(activeGroupId);
    }, [activeGroupId]);

    return (
        <div className="mb-4">
            <CaCredits />
            <div className="flex flex-col gap-2">
                {FORENSIC_NAV_GROUPS.map((group) => {
                    const open = openId === group.id;
                    return (
                        <div key={group.id}>
                            <button
                                type="button"
                                className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[10px] uppercase tracking-[0.16em] text-soft-400 hover:bg-weak-50"
                                aria-expanded={open}
                                onClick={() =>
                                    setOpenId((current) =>
                                        current === group.id ? "" : group.id
                                    )
                                }
                            >
                                <span className="min-w-0 truncate">
                                    {group.label}
                                </span>
                                <span aria-hidden="true">{open ? "−" : "+"}</span>
                            </button>
                            {open ? (
                                <div className="flex flex-col gap-0.5">
                                    {group.items.map((item) => {
                                        const active =
                                            item.id === "intake"
                                                ? pathname ===
                                                  "/workspace/forensic"
                                                : pathname === item.href;
                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                title={item.label}
                                                onClick={() =>
                                                    router.push(item.href)
                                                }
                                                className={`truncate rounded-xl px-3 py-2 text-left text-label-sm transition-colors ${
                                                    active
                                                        ? "border-l-[3px] border-blue-500 bg-weak-50 text-strong-950"
                                                        : "border-l-[3px] border-transparent text-sub-600 hover:bg-weak-50/70 hover:text-strong-950"
                                                }`}
                                            >
                                                {item.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ForensicNav;
