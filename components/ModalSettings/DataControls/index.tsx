import { useState } from "react";
import Switch from "@/components/Switch";
import Button from "@/components/Button";

const DataControls = ({}) => {
    const [improve, setImprove] = useState(true);

    return (
        <div className="">
            <div className="flex justify-between gap-6 mb-3 pb-3 border-b border-stroke-soft-200">
                <div className="max-w-101">
                    <div className="text-label-md">
                        Improve the model for everyone
                    </div>
                    <div className="text-sub-600">
                        Allow your content to be used to train our models, which
                        makes AI better for you and everyone who uses it. We
                        take steps to protect your privacy.{" "}
                        <button className="underline text-blue-500 hover:no-underline">
                            Learn more
                        </button>
                    </div>
                </div>
                <Switch checked={improve} onChange={setImprove} isSmall />
            </div>
            <div className="flex justify-between items-center gap-6 mb-3 pb-3 border-b border-stroke-soft-200">
                <div className="text-label-md">Export Data</div>
                <Button
                    className="!h-10 !rounded-[0.625rem] !bg-weak-50"
                    isStroke
                >
                    Export
                </Button>
            </div>
            <div className="flex justify-between items-center gap-6 mb-3 pb-3 border-b border-stroke-soft-200">
                <div className="text-label-md">Shared Links</div>
                <Button
                    className="!h-10 !rounded-[0.625rem] !bg-weak-50"
                    isStroke
                >
                    Manage
                </Button>
            </div>
            <div className="flex justify-between items-center gap-6 mb-3 pb-3 border-b border-stroke-soft-200">
                <div className="text-label-md">Archive all chats</div>
                <Button
                    className="!h-10 !rounded-[0.625rem] !bg-weak-50"
                    isStroke
                >
                    Archive all
                </Button>
            </div>
            <div className="flex justify-between items-center gap-6">
                <div className="text-label-md">Delete Account</div>
                <Button className="!h-10 !rounded-[0.625rem]" isRed>
                    Delete Account
                </Button>
            </div>
        </div>
    );
};

export default DataControls;
