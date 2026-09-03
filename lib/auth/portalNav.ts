import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import {
    adminSignInUrl,
    portalKindFromHost,
    signInUrl,
    subdomainRoutingEnabled,
} from "./hosts";

function pathFromUrl(url: string): string {
    try {
        const parsed = new URL(url, "http://local");
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        return url;
    }
}

export function shouldUseFullNavigation(url: string): boolean {
    if (typeof window === "undefined" || !subdomainRoutingEnabled()) {
        return false;
    }
    try {
        const target = new URL(url, window.location.origin);
        return target.origin !== window.location.origin;
    } catch {
        return false;
    }
}

export function portalNavigate(router: AppRouterInstance, url: string) {
    if (shouldUseFullNavigation(url)) {
        window.location.assign(url);
        return;
    }
    router.replace(pathFromUrl(url));
}

function currentPortal() {
    if (typeof window === "undefined") return null;
    return portalKindFromHost(window.location.host);
}

export function redirectToSignIn(router: AppRouterInstance, nextPath?: string) {
    if (currentPortal() === "admin") {
        portalNavigate(router, adminSignInUrl(false));
        return;
    }
    portalNavigate(router, signInUrl(nextPath, false));
}

export function redirectToSignInAfterLogout(router: AppRouterInstance) {
    if (currentPortal() === "admin") {
        portalNavigate(router, adminSignInUrl(true));
        return;
    }
    portalNavigate(router, signInUrl(undefined, true));
}

export function portalPush(router: AppRouterInstance, url: string) {
    if (shouldUseFullNavigation(url)) {
        window.location.assign(url);
        return;
    }
    router.push(pathFromUrl(url));
}
