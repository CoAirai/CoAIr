import { useState } from "react";
import Image from "@/components/Image";
import ModalView from "@/components/ModalView";

type Props = {
    className?: string;
    image: string;
    index: number;
};

const Preview = ({ className, image, index }: Props) => {
    const [open, setOpen] = useState(false);

    return (
        <>
            <div
                className={`absolute cursor-pointer overflow-hidden rounded-xl ${
                    className || ""
                }`}
                onClick={() => setOpen(true)}
            >
                <Image
                    className="object-cover scale-101"
                    src={image}
                    fill
                    alt=""
                />
                {index === 0 && (
                    <div className="absolute inset-0 rounded-xl bg-overlay backdrop-blur-2xl">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex justify-center items-center gap-1.5 w-full">
                            <Image
                                className="w-6 opacity-100"
                                src="/images/stars-white.svg"
                                width={24}
                                height={24}
                                alt=""
                            />
                            <div className="text-label-sm text-static-white max-md:text-label-xs">
                                Generating...
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <ModalView
                open={open}
                onClose={() => setOpen(false)}
                image={image}
            />
        </>
    );
};

export default Preview;
