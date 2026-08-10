import Chat from "@/components/Chat";
import Question from "@/components/Question";
import Answer from "@/components/Answer";
import Image from "@/components/Image";

import { content } from "./content";

const WebDesign = () => {
    return (
        <Chat>
            <Question>
                Scrape this URL and give me all the links:{" "}
                <a
                    className="underline text-label-sm text-blue-500 transition-colors hover:text-blue-400 hover:no-underline"
                    href="https://example.com"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    https://example.com
                </a>
            </Question>
            <Answer>
                <div className="mb-6 max-md:mb-4">
                    If you&apos;re searching for the most beautiful websites
                    built with Webflow, there are several standout examples that
                    showcase the platform&apos;s capabilities in design,
                    interactivity, and storytelling. Here are some notable ones:
                </div>
                <div className="flex flex-wrap -mt-3 -mx-1.5">
                    {content.map((item, index) => (
                        <div
                            className="w-[calc(50%-0.75rem)] mt-3 mx-1.5 p-3 bg-weak-50 border border-stroke-soft-200 rounded-2xl max-md:w-[calc(100%-0.75rem)]"
                            key={item.id}
                        >
                            <div className="text-[0.875rem] leading-[2rem] text-green-600">
                                Article #{index + 1}
                            </div>
                            <div className="mb-2 text-label-lg max-md:text-label-md">
                                {item.title}
                            </div>
                            <div className="text-sub-600">
                                {item.description}&nbsp;
                                <span className="text-blue-500 transition-colors cursor-pointer hover:text-blue-400">
                                    See more
                                </span>
                            </div>
                            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-stroke-soft-200">
                                <div className="shrink-0">
                                    <Image
                                        className="size-10 rounded-full object-cover opacity-100"
                                        src={item.avatar}
                                        width={40}
                                        height={40}
                                        alt="Avatar"
                                    />
                                </div>
                                <div className="grow">
                                    <div className="text-label-md max-md:text-label-sm">
                                        {item.person}
                                    </div>
                                    <div className="text-p-xs text-soft-400">
                                        {item.email}
                                    </div>
                                </div>
                                <div className="shrink-0 text-p-xs text-soft-400">
                                    {item.time}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </Answer>
        </Chat>
    );
};

export default WebDesign;
