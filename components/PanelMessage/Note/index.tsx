import { useState } from "react";
import Icon from "@/components/Icon";

const Note = ({}) => {
    const [isVisible, setIsVisible] = useState(true);

    return isVisible ? (
        <div className="flex items-center gap-1.5 min-h-8 px-3 py-1.5 rounded-t-xl bg-blue-50 border-b border-stroke-soft-200 text-label-xs text-blue-500">
            <div className="shrink-0 text-0">
                <Icon className="!size-4 fill-blue-500" name="alert-circle" />
            </div>
            <div className="grow">
                By select a feature, it will make you goal easily to achieve
            </div>
            <button className="group" onClick={() => setIsVisible(false)}>
                <Icon
                    className="!size-4 fill-strong-950 transition-colors group-hover:fill-red-500"
                    name="close"
                />
            </button>
        </div>
    ) : null;
};

export default Note;
