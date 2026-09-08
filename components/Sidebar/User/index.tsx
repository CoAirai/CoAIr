"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import Icon from "@/components/Icon";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { authHref } from "@/lib/auth/hosts";
import { redirectToSignInAfterLogout } from "@/lib/auth/portalNav";
import { homePathForRole } from "@/lib/auth/resolveLogin";

const itemClassName =
    "flex w-full items-center rounded-lg px-3 py-2 text-left text-label-sm text-sub-600 outline-0 transition-colors data-focus:bg-weak-50 data-focus:text-strong-950";

function initialsFrom(name: string) {
    return (
        name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() ?? "")
            .join("") || "U"
    );
}

const User = () => {
    const router = useRouter();
    const { session, signOut } = useAuth();

    if (!session) {
        return (
            <Link
                className="group flex items-center shrink-0 gap-2 mx-5 pt-3 px-3 pb-5 border-t border-stroke-soft-200"
                href={authHref("/auth/sign-in")}
            >
                <UserAvatar initials="?" sizeClassName="size-10" />
                <div className="text-label-sm">
                    <div className="">Sign in</div>
                    <div className="text-sub-600">Open your workspace</div>
                </div>
                <Icon
                    className="ml-auto fill-sub-600 -rotate-90 transition-transform group-hover:translate-x-0.5"
                    name="chevron"
                />
            </Link>
        );
    }

    const initials = initialsFrom(session.name || session.email || "U");

    return (
        <Menu as="div" className="relative mx-5 shrink-0 border-t border-stroke-soft-200 pt-3 px-3 pb-5">
            <MenuButton className="group flex w-full items-center gap-2 outline-0">
                <UserAvatar initials={initials} sizeClassName="size-10" />
                <div className="min-w-0 text-left text-label-sm">
                    <div className="truncate">{session.name}</div>
                    <div className="truncate text-sub-600">{session.email}</div>
                </div>
                <Icon
                    className="ml-auto fill-sub-600 transition-transform group-data-open:rotate-180"
                    name="chevron"
                />
            </MenuButton>
            <MenuItems
                transition
                anchor="top start"
                modal={false}
                className="z-30 w-56 origin-bottom-left rounded-xl border border-stroke-soft-200 bg-white-0 p-1 shadow-xl outline-0 transition duration-200 ease-out [--anchor-gap:0.5rem] data-closed:scale-95 data-closed:opacity-0"
            >
                <MenuItem>
                    <Link
                        href={homePathForRole(session.role)}
                        className={itemClassName}
                    >
                        Open dashboard
                    </Link>
                </MenuItem>
                <MenuItem
                    as="button"
                    type="button"
                    className={itemClassName}
                    onClick={async () => {
                        await signOut();
                        redirectToSignInAfterLogout(router);
                    }}
                >
                    Sign out
                </MenuItem>
            </MenuItems>
        </Menu>
    );
};

export default User;
