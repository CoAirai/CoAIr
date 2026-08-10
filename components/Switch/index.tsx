import { Switch as HeadlessSwitch } from "@headlessui/react";

type SwitchProps = {
    className?: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    isSmall?: boolean;
};

const Switch = ({ className, checked, onChange, isSmall }: SwitchProps) => (
    <HeadlessSwitch
        className={`group shrink-0 inline-flex p-0.5 rounded-full bg-soft-200 data-[checked]:!bg-blue-500 ${
            isSmall ? "w-7 h-4" : "w-9 h-5"
        } ${className || ""}`}
        checked={checked}
        onChange={onChange}
    >
        <span
            className={`relative rounded-full bg-white-0 shadow-[0_0.0625rem_0.125rem_0_rgba(16,24,40,0.06),0_0.0625rem_0.125rem_0_rgba(16,24,40,0.10)] transition-transform ${
                isSmall
                    ? "size-3 group-data-[checked]:translate-x-3 before:absolute before:inset-1 before:rounded-full before:transition-colors before:bg-soft-200 group-data-[checked]:before:bg-blue-500 dark:bg-static-white"
                    : "size-4 group-data-[checked]:translate-x-4"
            }`}
        />
    </HeadlessSwitch>
);

export default Switch;
