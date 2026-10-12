"use client";

import { useEffect, useState } from "react";
import Switch from "@/components/Switch";
import { useAuth } from "@/context/AuthContext";
import {
    disableBrowserPush,
    enableBrowserPush,
} from "@/lib/notifications/browserPush";
import {
    prefsFromFeatures,
    readNotificationPrefs,
    writeNotificationPrefs,
    type NotificationPrefs,
} from "@/lib/notifications/prefs";
import { updateMyNotificationPrefs } from "@/lib/coair/org";

const Notifications = () => {
    const { session } = useAuth();
    const [prefs, setPrefs] = useState<NotificationPrefs>(() =>
        readNotificationPrefs()
    );
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        setPrefs(readNotificationPrefs());
    }, []);

    const persist = async (next: NotificationPrefs, note?: string) => {
        setPrefs(next);
        writeNotificationPrefs(next);
        const token = session?.accessToken;
        if (!token || session?.source !== "live") {
            setMessage(note || "Saved on this device.");
            return;
        }
        setSaving(true);
        try {
            const result = await updateMyNotificationPrefs(token, next);
            if (result.features) {
                setPrefs(prefsFromFeatures(result.features));
            }
            setMessage(note || (next.email ? "Email on." : "Email off."));
        } catch {
            setMessage("Saved locally. Could not sync to server yet.");
        } finally {
            setSaving(false);
        }
    };

    const allowPush = async () => {
        const token = session?.accessToken;
        if (!token || session?.source !== "live") {
            setMessage("Sign in to turn push on.");
            return;
        }
        setSaving(true);
        try {
            const error = await enableBrowserPush(token);
            if (error) {
                setMessage(error);
                return;
            }
            await persist(
                { ...prefs, push: true },
                "Push on. This browser will alert you when work finishes, even after you leave the page."
            );
        } catch {
            setMessage("Could not turn push on in this browser.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="">
            <p className="mb-4 text-label-sm text-sub-600">
                When Email is on, you receive COAir emails — invites, billing,
                invoices, sign-in alerts, password-reset notices, and account
                updates. Company admins also get alerts when teammates sign in
                or request a password reset.
            </p>
            <div className="flex items-center mb-3 pb-3 border-b border-stroke-soft-200">
                <div className="mr-auto">
                    <div className="text-label-md">Responses</div>
                    <div className="text-label-xs text-sub-600">
                        A bell in the header when indexing, a chronology,
                        FORENSIS, or a QUERIS answer finishes.
                    </div>
                </div>
                <Switch
                    checked={prefs.responses}
                    onChange={(checked) =>
                        void persist(
                            { ...prefs, responses: checked },
                            checked
                                ? "Responses on. Finished work shows in the bell."
                                : "Responses off."
                        )
                    }
                    isSmall
                />
            </div>
            <div className="flex items-center mb-3 pb-3 border-b border-stroke-soft-200">
                <div className="mr-auto">
                    <div className="text-label-md">Push</div>
                    <div className="text-label-xs text-sub-600">
                        A browser alert for the same events, including after
                        you leave the page.
                    </div>
                </div>
                <Switch
                    checked={prefs.push}
                    onChange={(checked) => {
                        if (!checked) {
                            const token = session?.accessToken;
                            if (token) void disableBrowserPush(token);
                            void persist({ ...prefs, push: false }, "Push off.");
                            return;
                        }
                        void allowPush();
                    }}
                    isSmall
                />
            </div>
            {prefs.push ? (
                <button
                    type="button"
                    className="mb-3 h-9 rounded-xl border border-stroke-soft-200 px-3 text-label-xs text-strong-950 hover:bg-weak-50"
                    onClick={() => void allowPush()}
                >
                    Allow this browser
                </button>
            ) : null}
            <div className="flex items-center mb-3 pb-3 border-b border-stroke-soft-200">
                <div className="mr-auto">
                    <div className="text-label-md">Email</div>
                    <div className="text-sub-600">
                        All email types: billing, invoices, invites, account
                    </div>
                </div>
                <Switch
                    checked={prefs.email}
                    onChange={(checked) =>
                        void persist(
                            { ...prefs, email: checked },
                            checked
                                ? "Email on. You'll get billing, invoices, invites, and account emails."
                                : "Email off."
                        )
                    }
                    isSmall
                />
            </div>
            {saving ? (
                <p className="text-label-xs text-sub-600">Saving…</p>
            ) : null}
            {message ? (
                <p className="text-label-xs text-sub-600">{message}</p>
            ) : null}
        </div>
    );
};

export default Notifications;
