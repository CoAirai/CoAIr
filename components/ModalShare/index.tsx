import Modal from "@/components/Modal";
import Button from "@/components/Button";
import Images from "./Images";

type Props = {
    open: boolean;
    onClose: () => void;
};

const ModalShare = ({ open, onClose }: Props) => {
    const link =
        "Https://AIchat.ai/share/board/2ca927-2028c-2028-20nc-AA2ca927-2028c-2028-20nc-AA";

    const handleCopyCode = async () => {
        try {
            await navigator.clipboard.writeText(link);
            console.log("Code copied to clipboard!");
        } catch (err) {
            console.error("Failed to copy code: ", err);
        }
    };

    return (
        <Modal classWrapper="max-w-138" open={open} onClose={onClose}>
            <Images />
            <div className="mb-2 text-center text-label-xl">Share Board</div>
            <div className="mb-4.5 text-center text-label-md text-sub-600 max-md:text-label-sm">
                People with link will be able to view conversations and ideas in
                this board.Changes you make after creating the link will remain
                private.
            </div>
            <div className="flex items-center gap-2 p-2 pl-3 border border-stroke-soft-200 rounded-lg bg-weak-50">
                <div className="truncate">{link}</div>
                <button
                    className="group flex justify-center items-center shrink-0 size-9 border border-stroke-soft-200 rounded-lg"
                    onClick={handleCopyCode}
                >
                    <svg
                        className="size-4.5 fill-icon-soft-400 transition-colors group-hover:fill-strong-950"
                        xmlns="http://www.w3.org/2000/svg"
                        width="13"
                        height="13"
                        viewBox="0 0 13 13"
                    >
                        <path
                            opacity=".4"
                            d="M9.108 4.32l1.94.068c.523.07.964.221 1.314.571s.501.791.571 1.314C13 6.776 13 7.417 13 8.212h0v.645h0l-.068 1.94c-.07.523-.221.964-.571 1.314s-.791.501-1.314.571c-.504.068-1.145.068-1.94.068h0-.645 0c-.795 0-1.436 0-1.94-.068-.523-.07-.964-.221-1.314-.571s-.5-.791-.571-1.314c-.068-.504-.068-1.145-.068-1.94h0v-.645h0l.068-1.94c.07-.523.221-.964.571-1.314s.791-.5 1.314-.571c.504-.068 1.145-.068 1.94-.068h0 .645 0z"
                        />
                        <path d="M3.698 8.161l.076-2.005c.083-.62.279-1.275.818-1.814s1.195-.735 1.814-.818c.562-.076 1.253-.076 2.005-.076h1.3c.172 0 .258 0 .31-.056s.046-.14.033-.307l-.042-.413c-.075-.558-.226-1.021-.546-1.412a2.76 2.76 0 0 0-.383-.383C8.671.539 8.178.39 7.578.319 6.995.25 6.257.25 5.325.25h-.057c-.932 0-1.67 0-2.253.069-.599.071-1.093.22-1.505.558a2.76 2.76 0 0 0-.383.383c-.338.412-.487.906-.558 1.505C.5 3.349.5 4.087.5 5.018v.057l.069 2.253c.071.599.22 1.093.558 1.505a2.76 2.76 0 0 0 .383.383c.391.321.854.471 1.412.546l.413.042c.168.012.251.019.307-.033s.056-.138.056-.31v-1.3z" />
                    </svg>
                </button>
            </div>
            <div className="flex justify-between items-center mt-4.5">
                <button
                    className="text-label-md text-strong-950 transition-colors hover:text-blue-500"
                    onClick={onClose}
                >
                    Cancel
                </button>
                <Button className="px-6.5" isBlack onClick={handleCopyCode}>
                    Update & Copy Link
                </Button>
            </div>
        </Modal>
    );
};

export default ModalShare;
