"use client";

import { usePathname, useRouter } from "next/navigation";
import { FORENSIC_NAV_GROUPS } from "@/lib/forensic/nav";

const ForensicNav = () => {
    const pathname = usePathname();
    const router = useRouter();

    return (
        <div className="mb-4">
            <div className="flex flex-col gap-4">
                {FORENSIC_NAV_GROUPS.map((group) => (
                    <div key={group.id}>
                        <div className="mb-1 px-3 text-[10px] uppercase tracking-[0.16em] text-soft-400">
                            {group.label}
                        </div>
                        <div className="flex flex-col gap-0.5">
                            {group.items.map((item) => {
                                const active =
                                    item.id === "intake"
                                        ? pathname === "/workspace/forensic"
                                        : pathname === item.href;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => router.push(item.href)}
                                        className={`rounded-xl px-3 py-2 text-left text-label-sm transition-colors ${
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
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ForensicNav;
