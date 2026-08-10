import { useState } from "react";
import Image from "@/components/Image";
import ModalView from "@/components/ModalView";

const SoloImage = ({}) => {
    const [open, setOpen] = useState(false);

    return (
        <>
            <div className="cursor-pointer" onClick={() => setOpen(true)}>
                <Image
                    className="w-full rounded-xl"
                    src="/images/image-1.jpg"
                    width={731}
                    height={418}
                    alt=""
                />
            </div>
            <ModalView
                open={open}
                onClose={() => setOpen(false)}
                image="/images/image-1.jpg"
            />
        </>
    );
};

export default SoloImage;
