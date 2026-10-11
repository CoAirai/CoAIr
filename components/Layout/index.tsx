"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import ImpersonationBanner from "@/components/Auth/ImpersonationBanner";
import MaintenanceBanner from "@/components/Auth/MaintenanceBanner";
import { useChat } from "@/context/ChatContext";

const SIDEBAR_MIN = 260;
const SIDEBAR_MAX = 560;
const SIDEBAR_DEFAULT = 320;
const SIDEBAR_WIDTH_KEY = "coair.sidebar.width";

function isCompactScreen() {
    return window.matchMedia("(max-width: 1023px)").matches;
}

function clampSidebarWidth(value: number) {
    return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, value));
}

type Props = {
    children: React.ReactNode;
    onClickNew?: () => void;
};

const Layout = ({ children, onClickNew }: Props) => {
    const [visibleSidebar, setVisibleSidebar] = useState(true);
    const [compact, setCompact] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
    const [resizing, setResizing] = useState(false);
    const widthRef = useRef(SIDEBAR_DEFAULT);
    const { clearChat } = useChat();

    useEffect(() => {
        const stored = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
        if (Number.isFinite(stored) && stored >= SIDEBAR_MIN && stored <= SIDEBAR_MAX) {
            widthRef.current = stored;
            setSidebarWidth(stored);
        }
        const query = window.matchMedia("(max-width: 1023px)");
        const apply = () => setCompact(query.matches);
        apply();
        if (query.matches) setVisibleSidebar(false);
        query.addEventListener("change", apply);
        return () => query.removeEventListener("change", apply);
    }, []);

    const onResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (compact || !visibleSidebar) return;
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = widthRef.current;
        setResizing(true);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        const onMove = (moveEvent: PointerEvent) => {
            const next = clampSidebarWidth(startWidth + moveEvent.clientX - startX);
            widthRef.current = next;
            setSidebarWidth(next);
        };
        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            setResizing(false);
            window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(widthRef.current));
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    const desktopOpen = visibleSidebar && !compact;

    return (
        <div
            className={`overflow-hidden pr-5 max-md:pl-4 max-md:pr-4 ${
                resizing ? "" : "transition-[padding] duration-300"
            } ${desktopOpen ? "" : "pl-5"}`}
            style={desktopOpen ? { paddingLeft: sidebarWidth + 40 } : undefined}
        >
            <Sidebar
                visible={visibleSidebar}
                width={sidebarWidth}
                sized={!compact}
                resizable={desktopOpen}
                resizing={resizing}
                onResizeStart={onResizeStart}
                onClose={() => setVisibleSidebar(false)}
                onClickNewChat={() => {
                    if (onClickNew) {
                        onClickNew();
                    } else {
                        clearChat();
                    }
                    if (isCompactScreen()) setVisibleSidebar(false);
                }}
            />
            <div className="bg-weak-50/40 pt-9.5 pb-5 max-2xl:pt-5 max-md:pt-3 max-md:pb-4">
                <MaintenanceBanner />
                <ImpersonationBanner />
                <Header
                    sidebarOpen={visibleSidebar}
                    onOpenSidebar={() => setVisibleSidebar(true)}
                />
                {children}
            </div>
            <div
                className={`fixed inset-0 z-10 hidden bg-overlay backdrop-blur-sm transition-all duration-300 max-lg:block max-md:hidden ${
                    visibleSidebar
                        ? "visible opacity-100"
                        : "invisible opacity-0"
                }`}
                onClick={() => setVisibleSidebar(false)}
            />
        </div>
    );
};

export default Layout;
