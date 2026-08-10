import Modal from "@/components/Modal";
import Image from "@/components/Image";
import Button from "@/components/Button";

type GalleryProps = {
    open: boolean;
    onClose: () => void;
    image: string;
};

const ModalView = ({ open, onClose, image }: GalleryProps) => (
    <Modal classWrapper="max-w-220" open={open} onClose={onClose}>
        <div className="flex items-center gap-3 mb-4.5 p-3 bg-weak-50 rounded-xl max-md:flex-wrap">
            <div className="flex justify-center items-center shrink-0 size-9 rounded-lg bg-white-0">
                <Image
                    className="w-4.5 opacity-100"
                    src="/images/stars.svg"
                    width={18}
                    height={18}
                    alt=""
                />
            </div>
            <div className="grow">
                <div className="text-label-sm">
                    You Are still on the free plan
                </div>
                <div className="mt-1 text-p-xs">
                    Upgrade your free plan into premium plan. Get premium Ai
                    features now and generate multiple Images !
                </div>
            </div>
            <Button
                className="shrink-0 !h-10 px-7 text-p-xs max-md:w-full"
                isBlack
            >
                Go Premium
            </Button>
        </div>
        <div className="relative h-110 rounded-xl overflow-hidden max-md:h-60">
            <Image className="object-cover scale-101" src={image} fill alt="" />
            <Button
                className="absolute right-3.5 bottom-4.5 max-md:right-2 max-md:bottom-2 max-md:gap-0 max-md:w-10 max-md:h-10 max-md:px-0 max-md:text-0"
                isWhite
            >
                <svg
                    className="!size-5 fill-strong-950"
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                >
                    <path d="M10.84 11.042c0-.46-.373-.833-.833-.833s-.833.373-.833.833v3.75h-.495c-.146 0-.326 0-.473.018h-.003c-.105.013-.585.073-.814.544s.022.889.077.979l.002.003a4.16 4.16 0 0 0 .281.387l.02.025.881 1.043c.158.163.339.33.532.463.171.118.463.287.822.287s.651-.169.822-.287c.192-.132.373-.3.532-.463.317-.326.635-.729.881-1.043l.02-.025.281-.387.002-.003c.054-.09.306-.507.077-.979s-.709-.531-.814-.544h-.003c-.147-.018-.327-.018-.473-.018h-.486v-3.75z" />
                    <path
                        opacity=".4"
                        d="M1.043 10.417c0-2.201 1.484-4.056 3.507-4.617.163-.045.245-.068.292-.116s.068-.13.109-.293a5.21 5.21 0 0 1 10.227.693c.023.204.034.307.086.366s.153.084.356.133c1.917.465 3.34 2.192 3.34 4.252 0 2.416-1.959 4.375-4.375 4.375h-.05c-.183 0-.274 0-.337-.042s-.106-.144-.191-.348c-.105-.251-.262-.486-.469-.687-.276-.268-.608-.445-.957-.53-.259-.063-.389-.095-.442-.163s-.053-.178-.053-.397v-2c0-1.151-.933-2.083-2.083-2.083s-2.083.933-2.083 2.083v2c0 .219 0 .329-.053.397s-.183.1-.442.163c-.349.085-.681.262-.957.53-.208.203-.384.438-.502.691-.097.208-.146.312-.214.352s-.153.032-.324.018c-2.455-.207-4.383-2.266-4.383-4.774z"
                    />
                </svg>
                Download Image
            </Button>
        </div>
    </Modal>
);

export default ModalView;
