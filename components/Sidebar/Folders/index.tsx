import { useState } from "react";
import AnimateHeight from "react-animate-height";
import Icon from "@/components/Icon";
import Actions from "@/components/Actions";

const actions = [
    { name: "Rename", onClick: () => {} },
    { name: "Delete", onClick: () => {} },
    { name: "Copy", onClick: () => {} },
];

import { folders } from "./folders";

const Folders = ({}) => {
    const [active, setActive] = useState(false);

    return (
        <div className="mb-2">
            <div
                className={`group flex items-center gap-2 h-10 px-3 text-label-sm transition-colors cursor-pointer hover:text-strong-950 ${
                    active ? "!text-blue-500" : "text-sub-600"
                }`}
                onClick={() => setActive(!active)}
            >
                <Icon
                    className={`group-hover:fill-strong-950 transition-colors ${
                        active ? "!fill-blue-500" : "fill-sub-600"
                    }`}
                    name="folder"
                />
                Folders
                <Icon
                    className={`ml-auto transition-transform ${
                        active ? "rotate-180 fill-blue-500" : "fill-strong-950"
                    }`}
                    name="chevron"
                />
            </div>
            <AnimateHeight duration={500} height={active ? "auto" : 0}>
                <div className="pl-5">
                    {folders.map((folder) => (
                        <div className="" key={folder.id}>
                            <div className="flex items-center gap-2 h-9 text-sub-600">
                                <Icon
                                    className="fill-icon-sub-600"
                                    name="folders"
                                />
                                {folder.name}
                            </div>
                            <div className="relative pt-2 pl-5 before:absolute before:top-0 before:left-0.5 before:bottom-4 before:w-0.25 before:bg-stroke-soft-200">
                                {folder.items.map((item) => (
                                    <div
                                        className="flex items-center h-8 gap-2 text-sub-600 [&_svg]:fill-icon-sub-600 not-last:mb-2 max-md:pr-3"
                                        key={item.id}
                                    >
                                        {item.type === "analytic" ? (
                                            <div className="flex items-center">
                                                <Icon name="template" />
                                                <Icon
                                                    className="!size-3"
                                                    name="plus"
                                                />
                                                <Icon name="analytic" />
                                            </div>
                                        ) : item.type === "image" ? (
                                            <Icon name="image-1" />
                                        ) : (
                                            <Icon name="voice" />
                                        )}
                                        <div className="truncate transition-colors cursor-pointer hover:text-strong-950">
                                            {item.name}
                                        </div>
                                        <Actions
                                            className="ml-auto"
                                            classNameButton="rotate-90"
                                            items={actions}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </AnimateHeight>
        </div>
    );
};

export default Folders;
