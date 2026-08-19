"use client";

import { ThemeProvider } from "next-themes";
import { AdminDataProvider } from "@/context/AdminDataContext";
import { AuthProvider } from "@/context/AuthContext";
import { ChatProvider } from "@/context/ChatContext";
import { LiveWorkspaceProvider } from "@/context/LiveWorkspaceContext";

const Providers = ({ children }: { children: React.ReactNode }) => {
    return (
        <ThemeProvider
            attribute="data-theme"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
        >
            <AdminDataProvider>
                <AuthProvider>
                    <LiveWorkspaceProvider>
                        <ChatProvider>{children}</ChatProvider>
                    </LiveWorkspaceProvider>
                </AuthProvider>
            </AdminDataProvider>
        </ThemeProvider>
    );
};

export default Providers;
