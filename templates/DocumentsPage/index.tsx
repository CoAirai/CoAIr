"use client";

import Layout from "@/components/Layout";
import Chat from "@/components/Chat";
import Image from "@/components/Image";
import Icon from "@/components/Icon";

import { content } from "./content";

const DocumentsPage = () => {
    return (
        <Layout>
            <Chat
                hidePanelMessage
                titleHead={
                    <div className="flex items-center gap-2 text-label-sm">
                        Documents
                        <div className="flex items-center h-5 px-1.5 border border-stroke-soft-200 rounded-sm text-label-xs text-sub-600">
                            20
                        </div>
                    </div>
                }
            >
                <div className="-mx-4.5 max-md:-mx-0.5">
                    {content.map((item) => (
                        <div
                            className="not-last:mb-8 max-md:not-last:mb-6"
                            key={item.id}
                        >
                            <div className="flex items-center gap-2.5 mb-5 max-md:mb-3">
                                <div className="text-label-md text-sub-600 max-md:text-label-sm">
                                    {item.title}
                                </div>
                                <div className="flex items-center h-5 px-1.5 border border-stroke-soft-200 rounded-sm text-label-xs text-sub-600">
                                    {item.counter}
                                </div>
                            </div>
                            <div className="flex flex-wrap -mt-3 -mx-1.5">
                                {item.items.map((item) => (
                                    <div
                                        className="w-[calc(33.333%-0.75rem)] mt-3 mx-1.5 p-2 pb-4 bg-white-0 border border-stroke-soft-200 rounded-xl shadow-[0_0.375rem_0.75rem_0_rgba(0,0,0,0.06)] cursor-pointer transition-colors hover:border-strong-950 max-md:w-[calc(100%-0.75rem)]"
                                        key={item.id}
                                    >
                                        <div className="mb-3 pt-2 pl-5.5 pr-6.5 bg-weak-50 rounded-t-lg">
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
                                                className="shrink-0 !size-4"
                                                name="document"
                                            />
                                            <div className="truncate text-label-sm">
                                                {item.title}
                                            </div>
                                            <div className="flex shrink-0 ml-auto">
                                                {item.avatars.map((avatar) => (
                                                    <Image
                                                        className="size-4 opacity-100 rounded-full object-cover not-last:-mr-1.5"
                                                        src={avatar}
                                                        width={16}
                                                        height={16}
                                                        key={avatar}
                                                        alt="Avatar"
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </Chat>
        </Layout>
    );
};

export default DocumentsPage;
