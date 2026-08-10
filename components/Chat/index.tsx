import PanelMessage from "@/components/PanelMessage";
import Head from "./Head";

type Props = {
    titleHead?: React.ReactNode;
    hidePanelMessage?: boolean;
    children: React.ReactNode;
};

const Chat = ({ titleHead, hidePanelMessage, children }: Props) => {
    return (
        <div className="chat-wrapper">
            <Head title={titleHead} />
            <div
                className={`flex flex-col gap-4.5 grow p-7.5 overflow-auto scrollbar-none max-md:gap-3 max-md:p-4 max-md:pb-8 ${
                    hidePanelMessage ? "" : "-mb-3 pb-10"
                }`}
            >
                {children}
            </div>
            {!hidePanelMessage && <PanelMessage />}
        </div>
    );
};

export default Chat;
