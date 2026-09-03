"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Switch from "@/components/Switch";
import Button from "@/components/Button";
import { useAuth } from "@/context/AuthContext";
import { redirectToSignInAfterLogout } from "@/lib/auth/portalNav";
import { updateMyProfile } from "@/lib/coair/org";
import {
    markSharedLinksManaged,
    readImproveModel,
    writeImproveModel,
} from "@/lib/settings/localPrefs";

const DataControls = () => {
    const router = useRouter();
    const { session, signOut } = useAuth();
    const [improve, setImprove] = useState(true);
    const [message, setMessage] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setImprove(readImproveModel());
    }, []);

    const onImprove = async (checked: boolean) => {
        setImprove(checked);
        writeImproveModel(checked);
        const token = session?.accessToken;
        if (token && session?.source === "live") {
            try {
                await updateMyProfile(token, { improve_model: checked });
                setMessage(
                    checked
                        ? "Model improvement preference saved."
                        : "Model improvement turned off."
                );
            } catch {
                setMessage("Saved on this device.");
            }
            return;
        }
        setMessage("Saved on this device.");
    };

    const onExport = () => {
        const payload = {
            exportedAt: new Date().toISOString(),
            email: session?.email ?? null,
            name: session?.name ?? null,
            role: session?.role ?? null,
            companyId: session?.companyId ?? null,
            companyName: session?.companyName ?? null,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "coair-account-export.json";
        anchor.click();
        URL.revokeObjectURL(url);
        setMessage("Account export downloaded.");
    };

    const onManageSharedLinks = () => {
        markSharedLinksManaged();
        setMessage("Shared links cleared for this device.");
    };

    const onArchiveChats = () => {
        try {
            const keys = Object.keys(localStorage).filter(
                (key) =>
                    key.includes("chat") ||
                    key.includes("thread") ||
                    key.includes("conversation")
            );
            for (const key of keys) {
                localStorage.removeItem(key);
            }
            setMessage(
                keys.length
                    ? `Archived ${keys.length} local chat item(s).`
                    : "No local chats to archive."
            );
        } catch {
            setMessage("Could not archive local chats.");
        }
    };

    const onDeleteAccount = async () => {
        const ok = window.confirm(
            "This will sign you out and clear local account data on this device. Continue?"
        );
        if (!ok) return;
        setBusy(true);
        try {
            localStorage.removeItem("coair.settings.avatar");
            localStorage.removeItem("coair.settings.phone");
            await signOut();
            redirectToSignInAfterLogout(router);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="">
            <div className="flex justify-between gap-6 mb-3 pb-3 border-b border-stroke-soft-200">
                <div className="max-w-101">
                    <div className="text-label-md">
                        Improve the model for everyone
                    </div>
                    <div className="text-sub-600">
                        Allow your content to be used to train our models, which
                        makes AI better for you and everyone who uses it. We
                        take steps to protect your privacy.
                    </div>
                </div>
                <Switch
                    checked={improve}
                    onChange={(checked) => void onImprove(checked)}
                    isSmall
                />
            </div>
            <div className="flex justify-between items-center gap-6 mb-3 pb-3 border-b border-stroke-soft-200">
                <div className="text-label-md">Export Data</div>
                <Button
                    type="button"
                    className="!h-10 !rounded-[0.625rem] !bg-weak-50"
                    isStroke
                    onClick={onExport}
                >
                    Export
                </Button>
            </div>
            <div className="flex justify-between items-center gap-6 mb-3 pb-3 border-b border-stroke-soft-200">
                <div className="text-label-md">Shared Links</div>
                <Button
                    type="button"
                    className="!h-10 !rounded-[0.625rem] !bg-weak-50"
                    isStroke
                    onClick={onManageSharedLinks}
                >
                    Manage
                </Button>
            </div>
            <div className="flex justify-between items-center gap-6 mb-3 pb-3 border-b border-stroke-soft-200">
                <div className="text-label-md">Archive all chats</div>
                <Button
                    type="button"
                    className="!h-10 !rounded-[0.625rem] !bg-weak-50"
                    isStroke
                    onClick={onArchiveChats}
                >
                    Archive all
                </Button>
            </div>
            <div className="flex justify-between items-center gap-6">
                <div className="text-label-md">Delete Account</div>
                <Button
                    type="button"
                    className="!h-10 !rounded-[0.625rem]"
                    isRed
                    disabled={busy}
                    onClick={() => void onDeleteAccount()}
                >
                    Delete Account
                </Button>
            </div>
            {message ? (
                <p className="mt-4 text-label-xs text-sub-600">{message}</p>
            ) : null}
        </div>
    );
};

export default DataControls;
