"use client";

import { useEffect, useState } from "react";
import Switch from "@/components/Switch";
import { useAuth } from "@/context/AuthContext";
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

    const persist = async (next: NotificationPrefs) => {
        setPrefs(next);
        writeNotificationPrefs(next);
        const token = session?.accessToken;
        if (!token || session?.source !== "live") {
            setMessage("Saved on this device.");
            return;
        }
        setSaving(true);
        try {
            const result = await updateMyNotificationPrefs(token, next);
            if (result.features) {
                setPrefs(prefsFromFeatures(result.features));
            }
            setMessage(
                next.email
                    ? "Email on — you'll get billing, invoices, invites, and account emails."
                    : "Email notifications off."
            );
        } catch {
            setMessage("Saved locally. Could not sync to server yet.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="">
            <p className="mb-4 text-label-sm text-sub-600">
                When Email is on, you receive all COAir email notifications —
                invites, billing invoices, purchases, and account updates.
            </p>
            <div className="flex items-center mb-3 pb-3 border-b border-stroke-soft-200">
                <div className="mr-auto">
                    <div className="text-label-md">Responses</div>
                    <div className="text-sub-600">AI response alerts</div>
                </div>
                <Switch
                    checked={prefs.responses}
                    onChange={(checked) =>
                        void persist({ ...prefs, responses: checked })
                    }
                    isSmall
                />
            </div>
            <div className="flex items-center mb-3 pb-3 border-b border-stroke-soft-200">
                <div className="mr-auto">
                    <div className="text-label-md">Push</div>
                    <div className="text-sub-600">Browser / app push alerts</div>
                </div>
                <Switch
                    checked={prefs.push}
                    onChange={(checked) =>
                        void persist({ ...prefs, push: checked })
                    }
                    isSmall
                />
            </div>
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
                        void persist({ ...prefs, email: checked })
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
