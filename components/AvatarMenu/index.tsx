"use client";

import Link from "next/link";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";

type Props = {
    initials: string;
    name?: string;
    email?: string;
    workspaceHref?: string;
    onSettings?: () => void;
    onSignOut: () => void;
};

const itemClassName =
    "flex w-full items-center rounded-lg px-3 py-2 text-left text-label-sm text-sub-600 outline-0 transition-colors data-focus:bg-weak-50 data-focus:text-strong-950";

const AvatarMenu = ({
    initials,
    name,
    email,
    workspaceHref,
    onSettings,
    onSignOut,
}: Props) => {
    return (
        <Menu as="div" className="relative shrink-0">
            <MenuButton
                className="flex size-10 items-center justify-center rounded-full border-2 border-stroke-soft-200 bg-weak-50 text-label-sm font-medium text-strong-950 outline-0 transition-colors hover:border-stroke-sub-300 hover:bg-soft-200 data-open:border-stroke-sub-300"
                aria-label="Open account menu"
            >
                {initials}
            </MenuButton>
            <MenuItems
                transition
                anchor="bottom end"
                modal={false}
                className="z-30 w-56 origin-top-right rounded-xl border border-stroke-soft-200 bg-white-0 p-1 shadow-xl outline-0 transition duration-200 ease-out [--anchor-gap:0.5rem] data-closed:scale-95 data-closed:opacity-0"
            >
                {(name || email) && (
                    <div className="border-b border-stroke-soft-200 px-3 py-2">
                        {name ? (
                            <div className="truncate text-label-sm text-strong-950">
                                {name}
                            </div>
                        ) : null}
                        {email ? (
                            <div className="truncate text-label-xs text-sub-600">
                                {email}
                            </div>
                        ) : null}
                    </div>
                )}
                {workspaceHref ? (
                    <MenuItem>
                        <Link href={workspaceHref} className={itemClassName}>
                            Open workspace
                        </Link>
                    </MenuItem>
                ) : null}
                {onSettings ? (
                    <MenuItem
                        as="button"
                        type="button"
                        className={itemClassName}
                        onClick={onSettings}
                    >
                        Settings
                    </MenuItem>
                ) : null}
                <MenuItem
                    as="button"
                    type="button"
                    className={itemClassName}
                    onClick={onSignOut}
                >
                    Sign out
                </MenuItem>
            </MenuItems>
        </Menu>
    );
};

export default AvatarMenu;
