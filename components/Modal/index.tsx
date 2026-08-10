import {
    Dialog,
    DialogPanel,
    DialogBackdrop,
    CloseButton,
} from "@headlessui/react";
import Icon from "@/components/Icon";

type ModalProps = {
    classWrapper?: string;
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
};

const Modal = ({ classWrapper, open, onClose, children }: ModalProps) => {
    return (
        <Dialog className="relative z-50" open={open} onClose={onClose}>
            <DialogBackdrop
                className="fixed inset-0 bg-overlay backdrop-blur-sm duration-300 ease-out data-[closed]:opacity-0"
                transition
            />
            <div className="fixed inset-0 flex p-4 overflow-y-auto max-lg:py-12">
                <DialogPanel
                    className={`relative w-full m-auto p-5.5 shadow-[0_0_1.25rem_0_rgba(0,0,0,0.02)] rounded-2xl bg-white-0 duration-300 ease-out data-[closed]:opacity-0 max-md:px-4 ${
                        classWrapper || ""
                    }`}
                    transition
                >
                    {children}
                    <CloseButton className="absolute left-[calc(100%+0.75rem)] top-0 z-15 size-8 bg-strong-950 rounded-full text-0 transition-colors hover:bg-strong-950/90 max-lg:top-auto max-lg:left-auto max-lg:right-0 max-lg:bottom-[calc(100%+0.5rem)]">
                        <Icon className="!size-4 fill-white-0" name="close" />
                    </CloseButton>
                </DialogPanel>
            </div>
        </Dialog>
    );
};

export default Modal;
