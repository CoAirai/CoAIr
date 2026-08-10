import { useState } from "react";
import Icon from "@/components/Icon";
import ModalShare from "@/components/ModalShare";
import Actions from "@/components/Actions";
import { useChat } from "@/context/ChatContext";

type ButtonProps = {
    icon: string;
    onClick: () => void;
    label: string;
};

const Button = ({ icon, onClick, label }: ButtonProps) => (
    <button
        type="button"
        className="group text-0"
        onClick={onClick}
        aria-label={label}
    >
        <Icon
            className="fill-strong-950 transition-colors group-hover:fill-blue-500"
            name={icon}
        />
    </button>
);

type Props = {
    title?: React.ReactNode;
};

const Head = ({ title }: Props) => {
    const [visible, setVisible] = useState(false);
    const { clearChat } = useChat();

    const actions = [
        {
            name: "New chat",
            onClick: () => {
                clearChat();
            },
        },
        {
            name: "Clear chat",
            onClick: () => {
                clearChat();
            },
        },
    ];

    return (
        <>
            <div className="flex h-13 shrink-0 items-center border-b border-stroke-soft-200 px-4">
                {title ? (
                    title
                ) : (
                    <div className="mr-auto min-w-0">
                        <div className="truncate text-label-sm font-medium text-strong-950">
                            Chat
                        </div>
                        <div className="truncate text-label-xs text-sub-600">
                            Ask with citations from your company documents
                        </div>
                    </div>
                )}
                <div className="ml-auto flex items-center gap-2">
                    <Button
                        icon="share"
                        label="Share"
                        onClick={() => setVisible(true)}
                    />
                    <Actions
                        classNameButton="[&_svg]:fill-strong-950"
                        items={actions}
                    />
                </div>
            </div>
            <ModalShare open={visible} onClose={() => setVisible(false)} />
        </>
    );
};

export default Head;
