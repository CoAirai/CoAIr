import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { portalKindFromHost } from "@/lib/auth/hosts";

const USER_PREFIXES = ["/workspace", "/company", "/onboarding"];

function trimOrigin(value: string | undefined) {
    return value?.trim().replace(/\/$/, "") ?? "";
}

function isPublicAsset(pathname: string) {
    return (
        pathname.startsWith("/_next") ||
        pathname.startsWith("/images/") ||
        pathname === "/favicon.ico" ||
        /\.[a-z0-9]+$/i.test(pathname)
    );
}

function isApiRoute(pathname: string) {
    return pathname.startsWith("/api") || pathname.startsWith("/coair-api");
}

export function middleware(request: NextRequest) {
    const portal = portalKindFromHost(request.headers.get("host"));
    if (!portal) {
        return NextResponse.next();
    }

    const { pathname, search } = request.nextUrl;
    if (isPublicAsset(pathname) || isApiRoute(pathname)) {
        return NextResponse.next();
    }

    const adminOrigin = trimOrigin(process.env.NEXT_PUBLIC_ADMIN_URL);
    const userOrigin = trimOrigin(process.env.NEXT_PUBLIC_USER_URL);
    const loginOrigin = trimOrigin(process.env.NEXT_PUBLIC_LOGIN_URL);

    if (portal === "login") {
        if (pathname === "/") {
            return NextResponse.redirect(new URL("/auth/sign-in", request.url));
        }
        if (pathname.startsWith("/auth")) {
            return NextResponse.next();
        }
        return NextResponse.redirect(new URL("/auth/sign-in", request.url));
    }

    if (pathname.startsWith("/auth") && loginOrigin) {
        return NextResponse.redirect(new URL(`${pathname}${search}`, loginOrigin));
    }

    if (portal === "admin") {
        if (pathname === "/") {
            return NextResponse.redirect(new URL("/admin", request.url));
        }
        if (pathname.startsWith("/admin")) {
            return NextResponse.next();
        }
        if (userOrigin && USER_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
            return NextResponse.redirect(new URL(`${pathname}${search}`, userOrigin));
        }
        return NextResponse.redirect(new URL("/admin", request.url));
    }

    if (pathname === "/") {
        return NextResponse.redirect(new URL("/workspace", request.url));
    }
    if (pathname.startsWith("/admin") && adminOrigin) {
        return NextResponse.redirect(new URL(`${pathname}${search}`, adminOrigin));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image).*)"],
};
