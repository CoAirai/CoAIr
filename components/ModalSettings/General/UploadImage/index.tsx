import { useState, useRef } from "react";
import Image from "@/components/Image";
import Button from "@/components/Button";
import Icon from "@/components/Icon";

const UploadImage = ({}) => {
    const [preview, setPreview] = useState<string | null>(
        "/images/avatar-1.png"
    );
    const inputRef = useRef<HTMLInputElement>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const objectUrl = URL.createObjectURL(file);
            setPreview(objectUrl);
        }
    };

    const handleRemove = () => {
        setPreview(null);
    };

    return (
        <div className="">
            <div className="flex items-center gap-3">
                <div className="relative flex justify-center items-center bg-soft-200 size-11.5 rounded-full overflow-hidden">
                    {preview ? (
                        <Image
                            className="size-full opacity-100"
                            src={preview}
                            width={48}
                            height={48}
                            alt="avatar"
                        />
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
                        accept="image/*"
                    />
                    <Button className="!h-9 rounded-lg" isStroke>
                        Upload image
                    </Button>
                </div>
                <Button
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
                We only support JPG, JPEG, or ,PNG file. 1MB max.
            </div>
        </div>
    );
};

export default UploadImage;
