"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { useChat } from "@/context/ChatContext";

type Props = {
    children: React.ReactNode;
    onClickNew?: () => void;
};

const Layout = ({ children, onClickNew }: Props) => {
    const [visibleSidebar, setVisibleSidebar] = useState(false);
    const { clearChat } = useChat();

    return (
        <div className="overflow-hidden pl-90 pr-5 transition-all max-3xl:pl-75 max-lg:pl-5 max-md:pl-4 max-md:pr-4">
            <Sidebar
                visible={visibleSidebar}
                onClose={() => setVisibleSidebar(false)}
                onClickNewChat={() => {
                    if (onClickNew) {
                        onClickNew();
                    } else {
                        clearChat();
                    }
                    setVisibleSidebar(false);
                }}
            />
            <div className="bg-weak-50/40 pt-9.5 pb-5 max-2xl:pt-5 max-md:pt-3 max-md:pb-4">
                <Header onOpenSidebar={() => setVisibleSidebar(true)} />
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
