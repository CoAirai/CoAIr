"use client";

import { useEffect, useRef, useState } from "react";
import Image from "@/components/Image";
import Button from "@/components/Button";
import Icon from "@/components/Icon";
import { compressAvatarFile } from "@/lib/settings/compressAvatar";
import {
    AVATAR_CHANGED_EVENT,
    readAvatarPreview,
} from "@/lib/settings/localPrefs";

type Props = {
    onChange?: (dataUrl: string | null) => void;
};

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

const UploadImage = ({ onChange }: Props) => {
    const [preview, setPreview] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const sync = () => setPreview(readAvatarPreview() ?? "/images/avatar-1.png");
        sync();
        window.addEventListener(AVATAR_CHANGED_EVENT, sync);
        return () => window.removeEventListener(AVATAR_CHANGED_EVENT, sync);
    }, []);

    const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setError(null);
        const type = file.type.toLowerCase();
        if (
            type &&
            type !== "image/jpeg" &&
            type !== "image/jpg" &&
            type !== "image/png"
        ) {
            setError("Use a JPG or PNG photo.");
            if (inputRef.current) inputRef.current.value = "";
            return;
        }
        if (file.size > MAX_PHOTO_BYTES) {
            setError("That photo is too large. Use one under 15MB.");
            if (inputRef.current) inputRef.current.value = "";
            return;
        }
        setBusy(true);
        try {
            const dataUrl = await compressAvatarFile(file);
            setPreview(dataUrl);
            onChange?.(dataUrl);
        } catch {
            setError("Could not use that photo. Try a different JPG or PNG.");
        } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    const handleRemove = () => {
        setPreview(null);
        onChange?.(null);
        if (inputRef.current) inputRef.current.value = "";
    };

    return (
        <div className="">
            <div className="flex items-center gap-3">
                <div className="relative flex justify-center items-center bg-soft-200 size-11.5 rounded-full overflow-hidden">
                    {preview ? (
                        preview.startsWith("data:") ||
                        preview.startsWith("blob:") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                className="size-full object-cover opacity-100"
                                src={preview}
                                width={48}
                                height={48}
                                alt="avatar"
                            />
                        ) : (
                            <Image
                                className="size-full opacity-100"
                                src={preview}
                                width={48}
                                height={48}
                                alt="avatar"
                            />
                        )
                    ) : (
                        <Icon
                            className="size-6 fill-strong-950"
                            name="profile"
                        />
                    )}
                </div>
                <div className="relative">
                    <input
                        className="absolute inset-0 opacity-0 cursor-pointer z-10 object-cover"
                        ref={inputRef}
                        type="file"
                        onChange={handleChange}
                        accept="image/jpeg,image/jpg,image/png"
                        disabled={busy}
                    />
                    <Button type="button" className="!h-9 rounded-lg" isStroke>
                        {busy ? "Uploading…" : "Upload image"}
                    </Button>
                </div>
                <Button
                    type="button"
                    className="!w-9 !h-9 !px-0 rounded-lg"
                    isStroke
                    onClick={handleRemove}
                    disabled={busy}
                >
                    <Image
                        className="size-6 opacity-100"
                        src="/images/trash.svg"
                        width={24}
                        height={24}
                        alt=""
                    />
                </Button>
            </div>
            <div className="mt-1.5 text-soft-400 max-md:text-p-xs">
                JPG or PNG. Large photos are resized automatically.
            </div>
            {error ? (
                <p className="mt-1 text-label-xs text-red-500">{error}</p>
            ) : null}
        </div>
    );
};

export default UploadImage;
