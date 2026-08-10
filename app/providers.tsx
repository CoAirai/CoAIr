"use client";

import { ThemeProvider } from "next-themes";
import { AdminDataProvider } from "@/context/AdminDataContext";
import { AuthProvider } from "@/context/AuthContext";
import { ChatProvider } from "@/context/ChatContext";

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
                    <ChatProvider>{children}</ChatProvider>
                </AuthProvider>
            </AdminDataProvider>
        </ThemeProvider>
    );
};

export default Providers;
