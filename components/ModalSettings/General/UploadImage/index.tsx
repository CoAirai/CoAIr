"use client";

import { useEffect, useRef, useState } from "react";
import Image from "@/components/Image";
import Button from "@/components/Button";
import Icon from "@/components/Icon";
import { readAvatarPreview } from "@/lib/settings/localPrefs";

type Props = {
    onChange?: (dataUrl: string | null) => void;
};

const UploadImage = ({ onChange }: Props) => {
    const [preview, setPreview] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setPreview(readAvatarPreview() ?? "/images/avatar-1.png");
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 1024 * 1024) {
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = typeof reader.result === "string" ? reader.result : null;
            setPreview(dataUrl);
            onChange?.(dataUrl);
        };
        reader.readAsDataURL(file);
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
                    />
                    <Button type="button" className="!h-9 rounded-lg" isStroke>
                        Upload image
                    </Button>
                </div>
                <Button
                    type="button"
                    className="!w-9 !h-9 !px-0 rounded-lg"
                    isStroke
                    onClick={handleRemove}
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
                We only support JPG, JPEG, or PNG. 1MB max.
            </div>
        </div>
    );
};

export default UploadImage;
