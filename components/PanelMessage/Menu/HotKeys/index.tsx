import Image from "@/components/Image";

const HotKeys = ({}) => (
    <div className="flex items-center gap-3 py-3.5 border-b border-stroke-soft-200 text-label-sm max-md:hidden">
        <div className="flex items-center gap-1.5">
            <div className="">
                <Image
                    className="w-5 opacity-100"
                    src="/images/key-square-arrow-down.svg"
                    width={20}
                    height={20}
                    alt=""
                />
            </div>
            <div className="rotate-180">
                <Image
                    className="w-5 opacity-100"
                    src="/images/key-square-arrow-down.svg"
                    width={20}
                    height={20}
                    alt=""
                />
            </div>
            To Navigate
        </div>
        <div className="flex items-center gap-1.5 mr-auto">
            <div className="rotate-180">
                <Image
                    className="w-5 opacity-100"
                    src="/images/key-square-enter.svg"
                    width={20}
                    height={20}
                    alt=""
                />
            </div>
            To Select
        </div>
        <div className="flex items-center gap-1.5">
            <div className="rotate-180">
                <Image
                    className="w-5 opacity-100"
                    src="/images/key-square-enter.svg"
                    width={20}
                    height={20}
                    alt=""
                />
            </div>
            To Close
        </div>
    </div>
);

export default HotKeys;
