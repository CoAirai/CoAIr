import { FadeLoader } from "react-spinners";
import Image from "@/components/Image";

const Converter = ({}) => {
    return (
        <div className="border border-stroke-soft-200 rounded-xl p-3.5">
            <div className="flex items-center gap-3 p-1.25 shadow-[0_0_3px_0_rgba(0,0,0,0.14)] rounded-xl">
                <div className="relative size-[46px] rounded-lg bg-weak-50 max-4xl:size-[36px]">
                    <div className="absolute -top-[7px] -left-[4px] scale-55 max-4xl:-top-[12px] max-4xl:-left-[10px] max-4xl:scale-35">
                        <FadeLoader color="var(--strong-950)" />
                    </div>
                </div>
                <div className="text-label-md max-md:text-label-sm">
                    Converting your file .....
                </div>
            </div>
            <div className="mt-3.5 p-3 rounded-xl bg-weak-50">
                <div className="flex items-center gap-2">
                    <div className="flex justify-center items-center size-7 rounded-sm bg-blue-50">
                        <Image
                            src="/images/xls-type.svg"
                            className="w-4.25 opacity-100"
                            width={15}
                            height={14}
                            alt="File"
                        />
                    </div>
                    <div className="text-label-sm">Docment res.XLS</div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                    <div className="relative grow h-1.5 bg-soft-200 rounded-full">
                        <div
                            className="absolute top-0 left-0 bottom-0 rounded-full bg-linear-to-r from-[#7D52F4] to-blue-500"
                            style={{ width: "80%" }}
                        ></div>
                    </div>
                    <div className="text-sub-600">80%</div>
                </div>
            </div>
        </div>
    );
};

export default Converter;
