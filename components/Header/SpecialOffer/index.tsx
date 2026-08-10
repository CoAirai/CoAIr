import { useState } from "react";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import ModalPlan from "@/components/ModalPlan";

const SpecialOffer = ({}) => {
    const [open, setOpen] = useState(false);
    const [openModalPlan, setOpenModalPlan] = useState(false);

    return (
        <>
            <Button
                icon="gift"
                isStroke
                isCircle
                onClick={() => setOpen(true)}
            />
            <Modal
                classWrapper="max-w-100"
                open={open}
                onClose={() => setOpen(false)}
            >
                <div className="mb-2 text-center text-h5">Special Offer</div>
                <div className="mb-6 text-p-md text-center text-sub-600">
                    Upgrade today and get 20% off your first month.
                </div>
                <Button
                    className="w-full h-12"
                    isBlack
                    icon="gift"
                    onClick={() => {
                        setOpen(false);
                        setOpenModalPlan(true);
                    }}
                >
                    Claim Offer
                </Button>
            </Modal>
            <ModalPlan
                open={openModalPlan}
                onClose={() => setOpenModalPlan(false)}
            />
        </>
    );
};

export default SpecialOffer;
