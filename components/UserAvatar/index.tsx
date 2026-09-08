"use client";

import { useEffect, useState } from "react";
import {
    AVATAR_CHANGED_EVENT,
    readAvatarPreview,
} from "@/lib/settings/localPrefs";

type Props = {
    initials: string;
    sizeClassName?: string;
    className?: string;
    alt?: string;
};

/** Shows uploaded profile image when present; otherwise initials. */
export default function UserAvatar({
    initials,
    sizeClassName = "size-10",
    className = "",
    alt = "User",
}: Props) {
    const [src, setSrc] = useState<string | null>(null);

    useEffect(() => {
        const sync = () => setSrc(readAvatarPreview());
        sync();
        window.addEventListener(AVATAR_CHANGED_EVENT, sync);
        window.addEventListener("storage", sync);
        return () => {
            window.removeEventListener(AVATAR_CHANGED_EVENT, sync);
            window.removeEventListener("storage", sync);
        };
    }, []);

    return (
        <div
            className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-stroke-soft-200 bg-weak-50 text-label-sm font-medium text-strong-950 ${sizeClassName} ${className}`}
        >
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={src}
                    alt={alt}
                    className="size-full object-cover"
                />
            ) : (
                <span aria-hidden="true">{initials}</span>
            )}
        </div>
    );
}
