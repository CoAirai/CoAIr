export type NotificationPrefs = {
    responses: boolean;
    push: boolean;
    email: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
    responses: true,
    push: true,
    email: true,
};

const STORAGE_KEY = "coair.notificationPrefs";

export function readNotificationPrefs(): NotificationPrefs {
    if (typeof window === "undefined") return { ...DEFAULT_NOTIFICATION_PREFS };
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_NOTIFICATION_PREFS };
        const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
        return {
            responses:
                typeof parsed.responses === "boolean"
                    ? parsed.responses
                    : DEFAULT_NOTIFICATION_PREFS.responses,
            push:
                typeof parsed.push === "boolean"
                    ? parsed.push
                    : DEFAULT_NOTIFICATION_PREFS.push,
            email:
                typeof parsed.email === "boolean"
                    ? parsed.email
                    : DEFAULT_NOTIFICATION_PREFS.email,
        };
    } catch {
        return { ...DEFAULT_NOTIFICATION_PREFS };
    }
}

export function writeNotificationPrefs(prefs: NotificationPrefs): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
        /* ignore */
    }
}

export function prefsFromFeatures(
    features?: Record<string, boolean> | null
): NotificationPrefs {
    return {
        responses:
            features?.notify_responses ?? DEFAULT_NOTIFICATION_PREFS.responses,
        push: features?.notify_push ?? DEFAULT_NOTIFICATION_PREFS.push,
        email: features?.notify_email ?? DEFAULT_NOTIFICATION_PREFS.email,
    };
}

export function featuresFromPrefs(
    prefs: NotificationPrefs
): Record<string, boolean> {
    return {
        notify_responses: prefs.responses,
        notify_push: prefs.push,
        notify_email: prefs.email,
    };
}
