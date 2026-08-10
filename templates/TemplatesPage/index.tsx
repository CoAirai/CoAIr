"use client";

import { useState } from "react";
import Layout from "@/components/Layout";
import Chat from "@/components/Chat";
import Image from "@/components/Image";
import Icon from "@/components/Icon";

import { content } from "./content";

const tabs = [
    {
        id: 0,
        title: "All",
    },
    {
        id: 1,
        title: "✍️ Writing",
    },
    {
        id: 2,
        title: "📄 Document",
    },
    {
        id: 3,
        title: "🎨 Image Generation",
    },
    {
        id: 4,
        title: "🧠 Prompt Engineering",
    },
];

const TemplatesPage = () => {
    const [activeTab, setActiveTab] = useState(0);

    return (
        <Layout>
            <Chat
                hidePanelMessage
                titleHead={
                    <div className="flex items-center gap-2 mr-auto">
                        <Icon className="fill-strong-950" name="template" />
                        <div className="text-label-sm">Templates</div>
                        <div className="px-3 py-0.5 bg-strong-950 rounded-md text-label-xs text-white-0">
                            Beta
                        </div>
                    </div>
                }
            >
                <div className="-mx-4.5 max-md:-mx-0.5">
                    <div className="flex gap-1 mb-8 p-1 bg-weak-50 rounded-[0.625rem] max-md:mb-6 max-md:overflow-auto max-md:scrollbar-none">
                        {tabs.map((tab) => (
                            <button
                                className={`flex-1 h-7 rounded-lg text-label-sm transition-colors hover:text-strong-950 max-2xl:flex-auto max-2xl:px-3 max-md:shrink-0 ${
                                    activeTab === tab.id
                                        ? "bg-white-0 shadow-[0_0.375rem_0.625rem_0_rgba(14,18,27,0.06),0_0.125rem_0.25rem_0_rgba(14,18,27,0.03)] text-strong-950"
                                        : "text-soft-400"
                                }`}
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.title}
                            </button>
                        ))}
                    </div>
                    <div className="">
                        {content.map((item) => (
                            <div
                                className="not-last:mb-8 max-md:not-last:mb-6"
                                key={item.id}
                            >
                                <div className="text-label-md text-sub-600 mb-3 max-md:mb-2 max-md:text-label-sm">
                                    {item.title}
                                </div>
                                <div className="flex flex-wrap -mt-3 -mx-1.5">
                                    {item.items.map((item) => (
                                        <div
                                            className="w-[calc(33.333%-0.75rem)] mt-3 mx-1.5 p-2 pb-4 bg-white-0 border border-stroke-soft-200 rounded-xl shadow-[0_0.375rem_0.75rem_0_rgba(0,0,0,0.06)] cursor-pointer max-md:w-[calc(100%-0.75rem)]"
                                            key={item.id}
                                        >
                                            <div className="mb-4 pt-2 px-5.5 pb-5 bg-weak-50 rounded-t-lg">
                                                <Image
                                                    className="w-full"
                                                    src={item.image}
                                                    width={199}
                                                    height={137}
                                                    alt=""
                                                />
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Icon
                                                    className="shrink-0 !size-4 fill-strong-950"
                                                    name="document"
                                                />
                                                <div className="truncate text-label-sm">
                                                    {item.title}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Chat>
        </Layout>
    );
};

export default TemplatesPage;
