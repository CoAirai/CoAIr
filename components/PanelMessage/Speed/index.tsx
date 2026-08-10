import { useState } from "react";
import Image from "@/components/Image";
import { Switch as HeadlessSwitch } from "@headlessui/react";

const Speed = ({}) => {
    const [checked, setChecked] = useState(false);

    return (
        <HeadlessSwitch
            className="relative group inline-flex w-16 h-6 p-0.75 rounded-full bg-soft-200 overflow-hidden"
            checked={checked}
            onChange={setChecked}
        >
            <Image
                className="absolute top-0 left-0 w-full opacity-100"
                src="/images/bg-toggle.png"
                width={64}
                height={24}
                alt="Speed"
            />
            <span className="relative z-2 flex items-center justify-center w-12 h-4.5 bg-white-0 rounded-full text-p-xs text-sub-600 transition-transform group-data-[checked]:translate-x-2.5">
                Speed
            </span>
        </HeadlessSwitch>
    );
};

export default Speed;
