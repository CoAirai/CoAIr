const AVATAR_KEY = "coair.settings.avatar";
const PHONE_KEY = "coair.settings.phone";
const IMPROVE_KEY = "coair.settings.improveModel";
const MFA_KEY = "coair.settings.mfaEnabled";
const SHARED_LINKS_KEY = "coair.settings.sharedLinksCleared";

function readBool(key: string, fallback: boolean): boolean {
    if (typeof window === "undefined") return fallback;
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === "1" || raw === "true";
}

function writeBool(key: string, value: boolean) {
    if (typeof window === "undefined") return;
    localStorage.setItem(key, value ? "1" : "0");
}

export function readAvatarPreview(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(AVATAR_KEY);
}

export function writeAvatarPreview(dataUrl: string | null) {
    if (typeof window === "undefined") return;
    if (!dataUrl) {
        localStorage.removeItem(AVATAR_KEY);
        return;
    }
    localStorage.setItem(AVATAR_KEY, dataUrl);
}

export function readPhoneLocal(): string {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(PHONE_KEY) ?? "";
}

export function writePhoneLocal(phone: string) {
    if (typeof window === "undefined") return;
    localStorage.setItem(PHONE_KEY, phone);
}

export function readImproveModel(): boolean {
    return readBool(IMPROVE_KEY, true);
}

export function writeImproveModel(value: boolean) {
    writeBool(IMPROVE_KEY, value);
}

export function readMfaEnabled(): boolean {
    return readBool(MFA_KEY, false);
}

export function writeMfaEnabled(value: boolean) {
    writeBool(MFA_KEY, value);
}

export function markSharedLinksManaged() {
    writeBool(SHARED_LINKS_KEY, true);
}
