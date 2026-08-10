import {
    Listbox,
    ListboxButton,
    ListboxOption,
    ListboxOptions,
} from "@headlessui/react";
import Icon from "@/components/Icon";

type SelectOption = {
    id: number;
    name: string;
};

type SelectProps = {
    className?: string;
    classButton?: string;
    value: SelectOption;
    onChange: (value: SelectOption) => void;
    options: SelectOption[];
};

const Select = ({
    className,
    classButton,
    value,
    onChange,
    options,
}: SelectProps) => {
    return (
        <Listbox
            className={`${className || ""}`}
            value={value}
            onChange={onChange}
            as="div"
        >
            <ListboxButton
                className={`group flex justify-between items-center w-full h-10 pl-4 pr-3 border border-stroke-soft-200 rounded-xl text-label-sm text-sub-600 fill-sub-600 transition-all outline-0 data-[hover]:border-stroke-sub-300 data-[hover]:text-strong-950 data-[hover]:fill-strong-950 data-[open]:fill-strong-950 data-[open]:text-strong-950 data-[open]:border-stroke-sub-300 ${
                    classButton || ""
                }`}
            >
                {value.name}
                <Icon
                    className="shrink-0 ml-2 fill-inherit transition-transform group-[[data-open]]:rotate-180"
                    name="chevron"
                />
            </ListboxButton>
            <ListboxOptions
                className="z-100 [--anchor-gap:0.25rem] w-[var(--button-width)] bg-white-0 border border-stroke-soft-200 shadow-lg rounded-xl overflow-hidden origin-top transition duration-200 ease-out outline-none data-[closed]:scale-95 data-[closed]:opacity-0"
                anchor="bottom"
                transition
                modal={false}
            >
                {options.map((option) => (
                    <ListboxOption
                        className="group relative px-4 py-2 truncate text-label-sm text-strong-950 cursor-pointer transition-colors data-[focus]:bg-weak-50 data-[selected]:bg-weak-50 not-last:mb-0.25"
                        key={option.id}
                        value={option}
                    >
                        {option.name}
                    </ListboxOption>
                ))}
            </ListboxOptions>
        </Listbox>
    );
};

export default Select;
