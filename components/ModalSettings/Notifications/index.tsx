import { useState } from "react";
import Switch from "@/components/Switch";

const Speech = ({}) => {
    const [responses, setResponses] = useState(true);
    const [push, setPush] = useState(true);
    const [email, setEmail] = useState(false);

    return (
        <div className="">
            <div className="flex items-center mb-3 pb-3 border-b border-stroke-soft-200">
                <div className="mr-auto">
                    <div className="text-label-md">Responses</div>
                    <div className="text-sub-600">Ai response Push</div>
                </div>
                <Switch checked={responses} onChange={setResponses} isSmall />
            </div>
            <div className="flex items-center mb-3 pb-3 border-b border-stroke-soft-200">
                <div className="mr-auto">
                    <div className="text-label-md">Push</div>
                </div>
                <Switch checked={push} onChange={setPush} isSmall />
            </div>
            <div className="flex items-center mb-3 pb-3 border-b border-stroke-soft-200">
                <div className="mr-auto">
                    <div className="text-label-md">Email</div>
                </div>
                <Switch checked={email} onChange={setEmail} isSmall />
            </div>
        </div>
    );
};

export default Speech;
