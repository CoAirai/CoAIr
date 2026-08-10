import { useState, useRef } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { motion } from "framer-motion";
import { useClickAway } from "react-use";
import Icon from "@/components/Icon";
import HotKeys from "./HotKeys";

import { items } from "./items";

const Menu = ({}) => {
    const [visible, setVisible] = useState(false);
    const [message, setMessage] = useState("");

    const ref = useRef(null);
    useClickAway(ref, () => {
        setVisible(false);
    });

    return (
        <div className="flex" ref={ref}>
            <button className="group" onClick={() => setVisible(!visible)}>
                <Icon
                    className={`transition-colors group-hover:fill-blue-500 ${
                        visible ? "fill-blue-500" : "fill-icon-soft-400"
                    }`}
                    name="zsh"
                />
            </button>
            {visible && (
                <motion.div
                    className="absolute -left-0.5 bottom-[calc(100%+0.75rem)] -right-0.5 px-3.5 shadow-[0_0_4.6rem_0_rgba(0,0,0,0.17)] bg-white-0 rounded-xl border border-stroke-soft-200"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                        delay: 0.2,
                    }}
                >
                    <HotKeys />
                    <div className="py-2">
                        {items.map((item, index) => (
                            <div
                                className="flex items-center gap-2 px-3 py-2 rounded-xl transition-colors cursor-pointer hover:bg-weak-50"
                                key={index}
                            >
                                <Icon
                                    className="shrink-0 fill-strong-950"
                                    name="arrow"
                                />
                                <div className="grow">
                                    <div className="text-label-sm">
                                        {item.title}
                                    </div>
                                    <div className="text-soft-400">
                                        {item.description}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="-mx-3.5 px-3.5 py-3 bg-weak-50 rounded-b-xl border-t border-stroke-soft-200">
                        <TextareaAutosize
                            className="w-full text-p-md text-strong-950 outline-none resize-none placeholder:text-sub-600"
                            maxRows={5}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Ask a question about this answer"
                        />
                    </div>
                </motion.div>
            )}
        </div>
    );
};
export default Menu;
