import { coairFetch } from "@/lib/coair/client";

type PushKeys = {
    publicKey: string;
};

function urlBase64ToUint8Array(value: string) {
    const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

async function currentSubscription() {
    if (!("serviceWorker" in navigator)) return null;
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!registration) return null;
    return registration.pushManager.getSubscription();
}

export async function enableBrowserPush(token: string): Promise<string | null> {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        return "This browser cannot show push alerts.";
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
        return "This browser blocked notifications.";
    }
    const registration = await navigator.serviceWorker.register("/sw.js");
    const ready = await navigator.serviceWorker.ready;
    const active = registration.active ? registration : ready;
    const keys = await coairFetch<PushKeys>("/push/vapid", { token });
    const existing = await active.pushManager.getSubscription();
    const subscription =
        existing ||
        (await active.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(keys.publicKey),
        }));
    const json = subscription.toJSON();
    const endpoint = json.endpoint || "";
    const p256dh = json.keys?.p256dh || "";
    const auth = json.keys?.auth || "";
    if (!endpoint || !p256dh || !auth) {
        return "This browser did not return a push subscription.";
    }
    await coairFetch("/push/subscription", {
        method: "PUT",
        token,
        body: { endpoint, p256dh, auth },
    });
    return null;
}

export async function disableBrowserPush(token: string) {
    const subscription = await currentSubscription();
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    try {
        await subscription.unsubscribe();
    } catch {
        /* the server delete still drops it */
    }
    if (!token || !endpoint) return;
    try {
        await coairFetch("/push/unsubscribe", {
            method: "POST",
            token,
            body: { endpoint },
        });
    } catch {
        /* turning the switch off locally is enough */
    }
}
