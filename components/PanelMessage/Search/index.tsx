import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { FadeLoader } from "react-spinners";
import { useClickAway } from "react-use";
import Icon from "@/components/Icon";

import { items } from "./items";

const Search = ({}) => {
    const [itemStates, setItemStates] = useState<
        Array<"pending" | "loading" | "active">
    >(new Array(items.length).fill("pending"));

    const [visible, setVisible] = useState(false);

    const ref = useRef(null);
    useClickAway(ref, () => {
        setVisible(false);
    });

    useEffect(() => {
        if (!visible) {
            setItemStates(new Array(items.length).fill("pending"));
            return;
        }

        const timeouts: NodeJS.Timeout[] = [];

        const animateItems = () => {
            items.forEach((_, index) => {
                const loadingTimeout = setTimeout(() => {
                    setItemStates((prev) => {
                        const newStates = [...prev];
                        newStates[index] = "loading";
                        return newStates;
                    });
                }, 3000 * index);

                const activeTimeout = setTimeout(() => {
                    setItemStates((prev) => {
                        const newStates = [...prev];
                        newStates[index] = "active";
                        return newStates;
                    });
                }, 3000 * index + 3000);

                timeouts.push(loadingTimeout, activeTimeout);
            });
        };

        animateItems();

        // Cleanup function - очищаємо всі таймери при зміні visible або unmount
        return () => {
            timeouts.forEach((timeout) => clearTimeout(timeout));
        };
    }, [visible]);

    return (
        <div className="flex mr-auto" ref={ref}>
            <button className="group" onClick={() => setVisible(!visible)}>
                <Icon
                    className={`transition-colors group-hover:fill-blue-500 ${
                        visible ? "fill-blue-500" : "fill-icon-soft-400"
                    }`}
                    name="ai-search"
                />
            </button>
            {visible && (
                <motion.div
                    className="absolute -left-0.5 bottom-[calc(100%+0.75rem)] -right-0.5 p-3.5 shadow-[0_0_4.6rem_0_rgba(0,0,0,0.17)] bg-white-0 rounded-xl border border-stroke-soft-200"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                        delay: 0.2,
                    }}
                >
                    <div className="flex items-center p-1.25 pr-3 rounded-xl shadow-[0_0_0.1875rem_0_rgba(0,0,0,0.14)]">
                        <div className="flex items-center gap-3 mr-auto text-label-md">
                            <div className="flex justify-center items-center size-9 rounded-lg bg-weak-50">
                                <Icon className="fill-strong-950" name="chat" />
                            </div>
                            Results
                        </div>
                        <button className="group flex items-center gap-1.5 text-sub-600 transition-colors hover:text-strong-950">
                            <Icon
                                className="fill-sub-600 transition-colors group-hover:fill-strong-950"
                                name="eye-hide"
                            />
                            Hide Steps
                        </button>
                    </div>
                    <div className="mt-3.5 p-3 bg-weak-50 rounded-xl">
                        {items.map((item, index) => {
                            const state = itemStates[index];
                            const isPending = state === "pending";
                            const isLoading = state === "loading";
                            const isActive = state === "active";

                            return (
                                <div
                                    className={`flex items-center gap-2 not-last:mb-3 ${
                                        isPending
                                            ? "opacity-28"
                                            : isLoading
                                            ? "opacity-100 text-blue-500"
                                            : isActive
                                            ? "opacity-100"
                                            : "opacity-28"
                                    }`}
                                    key={index}
                                >
                                    <div className="relative shrink-0 size-[20px] text-0">
                                        {isLoading ? (
                                            <div className="absolute -top-[20px] -left-[18px] scale-40">
                                                <FadeLoader color="var(--blue-500)" />
                                            </div>
                                        ) : (
                                            <Icon
                                                className="!size-[20px] fill-strong-950"
                                                name={item.icon}
                                            />
                                        )}
                                    </div>
                                    <div className="text-label-sm">
                                        {item.title}
                                        {isActive && (
                                            <Icon
                                                className="-my-0.5 ml-2 fill-[#1DAF61]"
                                                name="check"
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>
            )}
        </div>
    );
};
export default Search;
