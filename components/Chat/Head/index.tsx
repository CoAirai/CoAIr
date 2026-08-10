import { useState } from "react";
import Icon from "@/components/Icon";
import ModalShare from "@/components/ModalShare";
import Actions from "@/components/Actions";

const actions = [
    { name: "New chat", onClick: () => {} },
    { name: "Move to folder", onClick: () => {} },
    { name: "Clear chat", onClick: () => {} },
    { name: "Delete chat", onClick: () => {} },
];

type ButtonProps = {
    icon: string;
    onClick: () => void;
};

const Button = ({ icon, onClick }: ButtonProps) => (
    <button className="group text-0" onClick={onClick}>
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

    return (
        <>
            <div className="flex items-center shrink-0 h-13 px-3 border-b border-stroke-soft-200">
                {title ? (
                    title
                ) : (
                    <div className="flex items-center gap-2 mr-auto">
                        <Icon className="fill-strong-950" name="chat" />
                        <div className="text-label-sm">Ask your AI</div>
                        <div className="px-3 py-0.5 bg-strong-950 rounded-md text-label-xs text-white-0">
                            Beta
                        </div>
                    </div>
                )}
                <div className="flex items-center gap-2 ml-auto">
                    <Button icon="share" onClick={() => setVisible(true)} />
                    <Button icon="link-1" onClick={() => {}} />
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
