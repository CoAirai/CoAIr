type TabItem = {
    id: number;
    name: string;
    onClick?: () => void;
};

type Props = {
    className?: string;
    items: TabItem[];
    value: TabItem;
    setValue: (value: TabItem) => void;
};

const Tabs = ({ className, items, value, setValue }: Props) => {
    return (
        <div className={`p-1 bg-weak-50 rounded-full ${className || ""}`}>
            <div className="relative flex">
                <div
                    className={`absolute top-0 left-0 bottom-0 rounded-full bg-white-0 transition-transform ${
                        items.length === 3 ? "w-1/3" : "w-1/2"
                    } ${value.id === items[1].id ? "translate-x-full" : ""}`}
                ></div>
                {items.map((item) => (
                    <button
                        className={`relative z-1 flex-1 h-9 text-label-sm transition-colors hover:text-strong-950 ${
                            value.id === item.id
                                ? "text-strong-950"
                                : "text-sub-600"
                        }`}
                        key={item.id}
                        onClick={() => {
                            setValue(item);
                            item.onClick?.();
                        }}
                    >
                        {item.name}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default Tabs;
