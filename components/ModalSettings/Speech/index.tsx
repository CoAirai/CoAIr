import { useState } from "react";
import Button from "@/components/Button";
import Icon from "@/components/Icon";
import Select from "@/components/Select";

const voiceOptions = [
    { id: 1, name: "Default" },
    { id: 2, name: "Echo" },
    { id: 3, name: "Tempo" },
];

const languages = [
    { id: 1, name: "English" },
    { id: 2, name: "French" },
    { id: 3, name: "Spanish" },
];

const Notifications = ({}) => {
    const [voice, setVoice] = useState(voiceOptions[0]);
    const [language, setLanguage] = useState(languages[0]);

    return (
        <div className="">
            <div className="flex items-center mb-3 pb-3 border-b border-stroke-soft-200">
                <div className="mr-auto">
                    <div className="text-label-md">Voice</div>
                    <div className="text-sub-600">Choose your ai voice.</div>
                </div>
                <div className="flex gap-1.5">
                    <Button
                        className="w-10 !h-10 !px-0 !rounded-[0.625rem] !bg-weak-50"
                        isStroke
                    >
                        <Icon className="fill-icon-sub-600" name="volume" />
                    </Button>
                    <Select
                        classButton="h-10 bg-weak-50 rounded-[0.625rem]"
                        value={voice}
                        onChange={setVoice}
                        options={voiceOptions}
                    />
                </div>
            </div>
            <div className="flex items-center gap-4">
                <div className="mr-auto">
                    <div className="text-label-md">Main Language</div>
                    <div className="text-sub-600">
                        For best results, select the language you mainly speak.
                    </div>
                </div>
                <Select
                    classButton="h-10 bg-weak-50 rounded-[0.625rem]"
                    value={language}
                    onChange={setLanguage}
                    options={languages}
                />
            </div>
        </div>
    );
};

export default Notifications;
