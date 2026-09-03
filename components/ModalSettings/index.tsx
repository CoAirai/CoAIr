import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import { useAuth } from "@/context/AuthContext";
import General from "./General";
import Notifications from "./Notifications";
import Theme from "./Theme";
import Security from "./Security";
import DataControls from "./DataControls";

import { menu } from "./menu";

type Props = {
    open: boolean;
    onClose: () => void;
    changePassword?: (
        current: string,
        next: string
    ) =>
        | { ok: boolean; error?: string }
        | Promise<{ ok: boolean; error?: string }>;
};

const Settings = ({ open, onClose, changePassword: changePasswordProp }: Props) => {
    const [activeId, setActiveId] = useState(0);
    const { changePassword: authChangePassword } = useAuth();
    const changePassword = changePasswordProp ?? authChangePassword;

    useEffect(() => {
        if (open) setActiveId(0);
    }, [open]);

    return (
        <>
            <Modal
                classWrapper="flex flex-col max-w-199.5 min-h-180 max-md:min-h-[calc(100svh-6rem)]"
                open={open}
                onClose={onClose}
            >
                <div className="mb-4.5 pb-2 border-b border-stroke-soft-200 max-md:mb-3">
                    <div className="text-label-xl max-md:text-label-lg">
                        Settings
                    </div>
                    <div className="mt-2 text-label-sm text-sub-600 max-md:hidden">
                        Manage your profile, theme, notifications, and security
                        preferences for this COAir workspace.
                    </div>
                </div>
                <div className="flex grow max-md:block">
                    <div className="flex flex-col gap-2 shrink-0 w-50 pr-4 border-r border-stroke-soft-200 max-lg:w-40 max-md:flex-row max-md:gap-4 max-md:w-auto max-md:mb-4 max-md:overflow-auto max-md:scrollbar-none max-md:-mx-4 max-md:px-4 max-md:border-0">
                        {menu.map((item) => (
                            <button
                                className={`group flex items-center gap-2 h-10 transition-colors hover:text-strong-950 max-md:shrink-0 ${
                                    activeId === item.id
                                        ? "!text-blue-500"
                                        : "text-sub-600"
                                }`}
                                onClick={() => setActiveId(item.id)}
                                key={item.id}
                            >
                                <Icon
                                    className={`transition-colors group-hover:fill-strong-950 ${
                                        activeId === item.id
                                            ? "!fill-blue-500"
                                            : "fill-sub-600"
                                    }`}
                                    name={item.icon}
                                />
                                {item.name}
                            </button>
                        ))}
                    </div>
                    <div className="grow pl-4 max-md:pl-0">
                        {menu
                            .filter((item) => item.id === activeId)
                            .map((item) => (
                                <div
                                    className="flex items-center gap-2.5 mb-8 text-label-lg max-md:hidden"
                                    key={item.id}
                                >
                                    <Icon
                                        className="!size-7 fill-strong-950"
                                        name={item.icon}
                                    />
                                    {item.name}
                                </div>
                            ))}
                        {activeId === 0 && <General />}
                        {activeId === 1 && <Notifications />}
                        {activeId === 2 && <Theme />}
                        {activeId === 3 && (
                            <Security changePassword={changePassword} />
                        )}
                        {activeId === 4 && <DataControls />}
                    </div>
                </div>
            </Modal>
        </>
    );
};

export default Settings;
