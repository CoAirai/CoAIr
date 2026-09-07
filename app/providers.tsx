"use client";

import "@/bones/registry";
import { ThemeProvider } from "next-themes";
import { AdminDataProvider } from "@/context/AdminDataContext";
import { AuthProvider } from "@/context/AuthContext";
import { ChatProvider } from "@/context/ChatContext";
import { LiveWorkspaceProvider } from "@/context/LiveWorkspaceContext";
import { ToastProvider } from "@/context/ToastContext";

const Providers = ({ children }: { children: React.ReactNode }) => {
    return (
        <ThemeProvider
            attribute="data-theme"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
        >
            <ToastProvider>
                <AdminDataProvider>
                    <AuthProvider>
                        <LiveWorkspaceProvider>
                            <ChatProvider>{children}</ChatProvider>
                        </LiveWorkspaceProvider>
                    </AuthProvider>
                </AdminDataProvider>
            </ToastProvider>
        </ThemeProvider>
    );
};

export default Providers;
