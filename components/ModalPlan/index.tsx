import Modal from "@/components/Modal";
import Button from "@/components/Button";
import Icon from "@/components/Icon";

import { plans } from "./plans";

type GalleryProps = {
    open: boolean;
    onClose: () => void;
};

const ModalPlan = ({ open, onClose }: GalleryProps) => (
    <Modal classWrapper="max-w-200" open={open} onClose={onClose}>
        <div className="mb-4 pb-1.5 border-b border-stroke-soft-200">
            <div className="text-label-xl">Plans</div>
            <div className="text-label-md text-sub-600">
                Manage your billing and payment details.
            </div>
        </div>
        <div className="flex gap-3 max-md:gap-1.5 max-md:-mx-4 max-md:px-4 max-md:overflow-auto max-md:scrollbar-none">
            {plans.map((plan) => (
                <div
                    className={`relative flex-1 p-3 rounded-2xl overflow-hidden max-md:shrink-0 max-md:flex-auto max-md:w-60 ${
                        plan.name === "Premium Plan"
                            ? "bg-weak-50 before:absolute before:-top-15 before:-right-32 before:size-60 before:bg-[#476CFF]/5 before:rounded-full before:blur-[3rem]"
                            : ""
                    }`}
                    key={plan.id}
                >
                    <div className="relative z-2">
                        <div className="flex justify-between items-center mb-4">
                            <Icon
                                className="!size-6 fill-strong-950"
                                name={plan.icon}
                            />
                            {plan.name === "Premium Plan" && (
                                <div className="flex items-center gap-1 h-6.5 px-2 rounded-full bg-[#476CFF]/10 text-label-xs text-blue-500">
                                    <Icon
                                        className="!size-3.25 fill-blue-500"
                                        name="flash"
                                    />
                                    Most Popular
                                </div>
                            )}
                        </div>
                        <div className="mb-1 text-label-lg">{plan.name}</div>
                        <div className="min-h-10.5 mb-3 text-soft-400">
                            {plan.description}
                        </div>
                        <div className="font-satoshi font-bold text-h5">
                            {plan.price}
                        </div>
                        <div className="mb-6 text-sub-600">{plan.details}</div>
                        <button
                            className={`flex justify-center items-center gap-1.5 w-full h-10 mb-6 rounded-[0.625rem] text-label-md transition-opacity hover:opacity-90 ${
                                plan.name === "Basic Plan"
                                    ? "bg-weak-50 [&_svg]:fill-strong-950"
                                    : plan.name === "Premium Plan"
                                    ? "border border-blue-500 text-blue-600"
                                    : "bg-blue-600 text-static-white [&_svg]:fill-static-white"
                            }`}
                        >
                            {plan.name === "Basic Plan"
                                ? "Buy now"
                                : plan.name === "Premium Plan"
                                ? "Switch to this plan"
                                : "Contact Us"}
                            {plan.name !== "Premium Plan" && (
                                <Icon className="-rotate-45" name="arrow" />
                            )}
                        </button>
                        <div className="">
                            {plan.features.map((feature, index) => (
                                <div
                                    className="flex items-center gap-2 py-4 border-t border-stroke-soft-200 text-label-sm"
                                    key={index}
                                >
                                    <svg
                                        className="shrink-0 fill-strong-950"
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="20"
                                        height="20"
                                        viewBox="0 0 20 20"
                                    >
                                        <path d="M16.611 5.124c.16.431-.06.911-.491 1.071-.882.327-1.85 1.009-2.83 1.909-.971.892-1.906 1.954-2.727 2.985l-2.004 2.739-.569.868-.149.237-.037.06-.009.015-.002.003c-.153.252-.429.406-.724.402s-.566-.164-.713-.42c-.791-1.384-1.444-2.008-1.838-2.283a1.49 1.49 0 0 0-.387-.208l-.03-.009c-.431-.032-.772-.392-.772-.831 0-.46.373-.833.833-.833.098.007.331.033.474.085.228.072.512.203.837.43.466.327 1.014.85 1.61 1.689l.092-.137 2.082-2.846c.852-1.07 1.847-2.204 2.903-3.174 1.047-.962 2.202-1.808 3.378-2.244.431-.16.911.06 1.071.491z" />
                                    </svg>
                                    {feature}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ))}
        </div>
        <div className="flex justify-end gap-3 mt-4.5">
            <Button className="!bg-weak-50" isStroke onClick={onClose}>
                Discard
            </Button>
            <Button isBlack>Upgrade Membership</Button>
        </div>
    </Modal>
);

export default ModalPlan;
