"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { useAuth } from "@/context/AuthContext";
import {
    listNotices,
    markNoticesRead,
    type CoairNotice,
} from "@/lib/coair/notices";
import { readNotificationPrefs } from "@/lib/notifications/prefs";

const ResponseBell = () => {
    const router = useRouter();
    const { session } = useAuth();
    const [enabled, setEnabled] = useState(false);
    const [open, setOpen] = useState(false);
    const [notices, setNotices] = useState<CoairNotice[]>([]);
    const [unread, setUnread] = useState(0);

    useEffect(() => {
        const sync = () => setEnabled(readNotificationPrefs().responses);
        sync();
        window.addEventListener("coair:notification-prefs", sync);
        return () => window.removeEventListener("coair:notification-prefs", sync);
    }, []);

    useEffect(() => {
        const token = session?.accessToken;
        if (!enabled || !token || session?.source !== "live") {
            setNotices([]);
            setUnread(0);
            return;
        }
        let cancelled = false;
        const load = () => {
            void listNotices(token)
                .then((result) => {
                    if (cancelled) return;
                    setNotices(result.notices);
                    setUnread(result.unread);
                })
                .catch(() => undefined);
        };
        load();
        const timer = window.setInterval(load, 20000);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [enabled, session?.accessToken, session?.source]);

    if (!enabled || session?.source !== "live") return null;

    const openList = () => {
        const next = !open;
        setOpen(next);
        if (next && unread > 0 && session?.accessToken) {
            void markNoticesRead(session.accessToken).then(() => setUnread(0));
        }
    };

    return (
        <div className="relative">
            <button
                type="button"
                className="relative flex size-10 items-center justify-center rounded-xl border border-stroke-soft-200 bg-white-0 hover:bg-weak-50"
                aria-label={unread > 0 ? `${unread} responses` : "Responses"}
                aria-expanded={open}
                onClick={openList}
            >
                <Icon className="fill-strong-950" name="bell" />
                {unread > 0 ? (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-blue-500" />
                ) : null}
            </button>
            {open ? (
                <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-stroke-soft-200 bg-white-0 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
                    <div className="px-3 py-2 text-label-xs text-soft-400">
                        Responses
                    </div>
                    {notices.length === 0 ? (
                        <p className="px-3 pb-3 text-label-sm text-sub-600">
                            Nothing finished yet.
                        </p>
                    ) : (
                        <ul className="max-h-80 overflow-auto">
                            {notices.map((notice) => (
                                <li key={notice.id}>
                                    <button
                                        type="button"
                                        className="w-full rounded-lg px-3 py-2 text-left hover:bg-weak-50"
                                        onClick={() => {
                                            setOpen(false);
                                            if (session?.accessToken) {
                                                void markNoticesRead(
                                                    session.accessToken,
                                                    [notice.id]
                                                );
                                            }
                                            router.push(notice.href || "/workspace");
                                        }}
                                    >
                                        <span className="block text-label-sm text-strong-950">
                                            {notice.title}
                                        </span>
                                        {notice.body ? (
                                            <span className="mt-0.5 block text-label-xs text-sub-600">
                                                {notice.body}
                                            </span>
                                        ) : null}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ) : null}
        </div>
    );
};

export default ResponseBell;
