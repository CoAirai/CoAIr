import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import Icon from "@/components/Icon";

type Props = {
    className?: string;
    classNameButton?: string;
    items: {
        name: string;
        onClick: () => void;
    }[];
};

const Actions = ({ className, classNameButton, items }: Props) => {
    return (
        <Menu className={`${className || ""}`} as="div">
            <MenuButton
                className={`group flex rounded-sm outline-0 transition-colors data-[open]:bg-weak-50 ${
                    classNameButton || ""
                }`}
            >
                <Icon
                    className="fill-icon-sub-600 transition-colors group-hover:fill-strong-950 group-[[data-open]]:fill-strong-950"
                    name="dots"
                />
            </MenuButton>
            <MenuItems
                className="[--anchor-gap:0.5rem] [--anchor-offset:0.5rem] z-20 flex flex-col w-40 p-1 border border-stroke-soft-200 rounded-xl outline-0 bg-white-0 shadow-xl transition duration-200 ease-out origin-top data-closed:scale-95 data-closed:opacity-0"
                anchor="bottom end"
                transition
                modal={false}
            >
                {items.map((item, index) => (
                    <MenuItem
                        className="group flex items-center gap-3 h-8 px-3 rounded-lg text-label-sm text-soft-600 transition-colors hover:bg-weak-50 hover:text-strong-950"
                        key={index}
                        onClick={() => item.onClick()}
                        as="button"
                    >
                        {item.name}
                    </MenuItem>
                ))}
            </MenuItems>
        </Menu>
    );
};

export default Actions;
