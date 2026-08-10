import { useState } from "react";
import Icon from "@/components/Icon";
import Tabs from "@/components/Tabs";
import Group from "./Group";

import { menu } from "./menu";

type Props = {
    activeId: string | null;
    setActiveId: (id: string | null) => void;
    visible: boolean;
    onClose: () => void;
};

const tabs = [
    { id: 0, name: "Tools" },
    { id: 1, name: "Files" },
];

const Tools = ({ activeId, setActiveId, visible, onClose }: Props) => {
    const [tab, setTab] = useState(tabs[0]);

    return (
        <div
            className={`fixed top-5 right-5 bottom-5 flex flex-col w-80 p-5 bg-white-0 rounded-3xl shadow-[0_0_1.25rem_0_rgba(0,0,0,0.03)] overflow-auto scrollbar-none transition-transform max-3xl:w-65 max-2xl:z-20 max-2xl:shadow-2xl max-lg:top-0 max-lg:right-0 max-lg:bottom-0 max-lg:w-75 max-lg:rounded-none max-md:w-full max-md:p-4 ${
                visible
                    ? "translate-x-0 max-2xl:translate-x-[calc(100%+1.25rem)]"
                    : "translate-x-[calc(100%+1.25rem)] max-2xl:translate-x-0"
            }`}
        >
            <div className="flex items-center gap-2 mb-5">
                <Icon className="!size-6 fill-strong-950" name="wrench" />
                <div className="text-[1.125rem] leading-[1.25rem]">Tools</div>
                <button className="group ml-auto text-0" onClick={onClose}>
                    <Icon
                        className="text-label-sm fill-strong-950 transition-colors group-hover:fill-blue-500"
                        name="close"
                    />
                </button>
            </div>
            <Tabs
                className="mb-5 max-md:mb-4"
                items={tabs}
                value={tab}
                setValue={setTab}
            />
            <div className="grow -mx-5 -mb-5 px-5 pb-5 overflow-y-auto scrollbar-none max-md:-mx-4 max-md:-mb-4 max-md:px-4 max-md:pb-4">
                {menu.map((group) => (
                    <Group
                        group={group}
                        key={group.id}
                        activeId={activeId}
                        setActiveId={setActiveId}
                    />
                ))}
            </div>
        </div>
    );
};

export default Tools;
