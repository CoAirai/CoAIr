import { useState } from "react";
import {
    Listbox,
    ListboxButton,
    ListboxOption,
    ListboxOptions,
} from "@headlessui/react";
import Icon from "@/components/Icon";

const options = [
    { id: 1, name: "My Workspace" },
    { id: 2, name: "Team Workspace" },
    { id: 3, name: "Sandbox" },
];

const MyWorkspace = ({}) => {
    const [value, setValue] = useState(options[0]);
    return (
        <Listbox value={value} onChange={setValue}>
            <ListboxButton className="group flex items-center gap-2 w-full p-1.25 pr-3 rounded-xl cursor-pointer outline-0 max-lg:w-[calc(100%-1.75rem)] dark:shadow-[0_0_0.1875rem_0_rgba(255,255,255,0.16)]">
                <div className="flex justify-center items-center bg-weak-50 rounded-lg size-8.75 font-medium">
                    P
                </div>
                <div className="truncate text-label-sm">{value.name}</div>
                <Icon
                    className="shrink-0 ml-auto fill-strong-950 transition-transform group-[[data-open]]:rotate-180"
                    name="chevron"
                />
            </ListboxButton>
            <ListboxOptions
                className="z-100 [--anchor-gap:0.25rem] w-[var(--button-width)] bg-white-0 border border-stroke-soft-200 shadow-lg rounded-xl origin-top overflow-hidden transition duration-200 ease-out outline-none data-[closed]:scale-95 data-[closed]:opacity-0"
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

export default MyWorkspace;
