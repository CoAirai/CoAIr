import { useState } from "react";
import Image from "@/components/Image";

const tabs = [
    { id: 0, name: "Generate Images" },
    { id: 1, name: "3 Media" },
];

const Images = ({}) => {
    const [activeTab, setActiveTab] = useState(1);

    return (
        <>
            <div className="absolute bottom-[calc(100%-0.75rem)] left-1/2 -translate-x-1/2">
                {(activeTab === 0
                    ? ["/images/image-5.jpg"]
                    : [
                          "/images/image-6.jpg",
                          "/images/image-5.jpg",
                          "/images/image-7.jpg",
                      ]
                ).map((image, index) => (
                    <div
                        key={index}
                        className="relative w-17 rounded-lg overflow-hidden first:z-3 not-first:absolute not-first:bottom-1.5 nth-2:right-1/4 nth-2:-rotate-15 nth-3:left-1/4 nth-3:rotate-15"
                    >
                        <Image
                            className="w-full scale-105 opacity-100"
                            src={image}
                            width={68}
                            height={94}
                            alt="Image"
                        />
                    </div>
                ))}
            </div>
            <div className="flex justify-center mb-4.5">
                <div className="flex justify-center gap-2 p-0.25 bg-weak-50 rounded-lg border border-stroke-soft-200">
                    {tabs.map((tab) => (
                        <button
                            className={`p-2 rounded-lg text-label-xs transition-colors ${
                                activeTab === tab.id ? "bg-soft-200" : ""
                            }`}
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.name}
                        </button>
                    ))}
                </div>
            </div>
        </>
    );
};

export default Images;
