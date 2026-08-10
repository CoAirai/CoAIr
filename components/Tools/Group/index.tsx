import Icon from "@/components/Icon";
import Switch from "@/components/Switch";

type Props = {
    group: {
        id: string;
        title: string;
        items: {
            id: string;
            title: string;
            description: string;
            icon: string;
        }[];
    };
    activeId: string | null;
    setActiveId: (id: string | null) => void;
};

const Group = ({ group, activeId, setActiveId }: Props) => {
    return (
        <div
            className="not-last:mb-5 not-last:pb-5 not-last:border-b border-stroke-soft-200"
            key={group.id}
        >
            <div className="mb-2 py-1 text-label-xs text-soft-400 max-md:mb-1">
                {group.title}
            </div>
            <div className="">
                {group.items.map((item) => (
                    <div
                        className="py-2 not-last:mb-1 max-md:py-1.5"
                        key={item.id}
                    >
                        <div className="flex items-center gap-2">
                            <Icon
                                className="fill-strong-950"
                                name={item.icon}
                            />
                            <div className="text-label-md">{item.title}</div>
                            <Switch
                                className="ml-auto"
                                checked={activeId === item.id}
                                onChange={() => {
                                    setActiveId(
                                        activeId === item.id ? null : item.id
                                    );
                                }}
                            />
                        </div>
                        <div className="mt-0.5 text-sub-600">
                            {item.description}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Group;
