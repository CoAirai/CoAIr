import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import Providers from "./providers";
import "./globals.css";

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
});

const satoshi = localFont({
    src: [
        {
            path: "../public/fonts/Satoshi-Light.woff2",
            weight: "300",
        },
        {
            path: "../public/fonts/Satoshi-Regular.woff2",
            weight: "400",
        },
        {
            path: "../public/fonts/Satoshi-Medium.woff2",
            weight: "500",
        },
        {
            path: "../public/fonts/Satoshi-Bold.woff2",
            weight: "700",
        },
    ],
    variable: "--font-satoshi",
});

const interDisplay = localFont({
    src: [
        {
            path: "../public/fonts/InterDisplay-Medium.woff2",
            weight: "500",
        },
    ],
    variable: "--font-inter-display",
});

const siteDescription =
    "COAir — chat, cite, and verify your construction project data";

export const metadata: Metadata = {
    title: "COAir",
    description: siteDescription,
    applicationName: "COAir",
    icons: {
        icon: [
            { url: "/icon.png", type: "image/png", sizes: "32x32" },
            { url: "/favicon.png", type: "image/png", sizes: "32x32" },
            { url: "/images/coair-logo.png", type: "image/png", sizes: "1024x1024" },
        ],
        shortcut: "/favicon.png",
        apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    },
    openGraph: {
        title: "COAir",
        description: siteDescription,
        siteName: "COAir",
        type: "website",
        images: [{ url: "/images/coair-logo.png" }],
    },
    twitter: {
        card: "summary",
        title: "COAir",
        description: siteDescription,
        images: ["/images/coair-logo.png"],
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html
            className="text-[calc(0.7rem+0.35vw)] max-[2300px]:text-[calc(0.7rem+0.32vw)] max-[2150px]:text-[calc(0.7rem+0.28vw)] max-4xl:text-[1rem]"
            lang="en"
            suppressHydrationWarning
        >
            <body
                className={`${satoshi.variable} ${inter.variable} ${interDisplay.variable} bg-weak-50 font-satoshi text-p-sm text-strong-950 antialiased`}
            >
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
