"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";

type NavLeaf = {
    href: string;
    label: string;
    icon: string;
};

const ITEMS: NavLeaf[] = [
    { href: "/company", label: "Dashboard", icon: "analytic" },
    { href: "/company/team", label: "Team", icon: "team" },
    { href: "/company/usage", label: "Usage", icon: "flash" },
    { href: "/company/billing", label: "Billing", icon: "gift" },
    { href: "/company/tickets", label: "Tickets", icon: "comment" },
];

const isActiveHref = (pathname: string, href: string) =>
    href === "/company" ? pathname === href : pathname.startsWith(href);

type Props = {
    onNavigate?: () => void;
    onOpenSettings?: () => void;
    settingsOpen?: boolean;
    collapsed?: boolean;
};

const CompanyNav = ({
    onNavigate,
    onOpenSettings,
    settingsOpen = false,
    collapsed = false,
}: Props) => {
    const pathname = usePathname();

    const renderLeaf = (item: NavLeaf) => {
        const active = isActiveHref(pathname, item.href);

        return (
            <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`group flex h-10 items-center rounded-xl text-label-sm transition-colors ${
                    collapsed
                        ? "justify-center px-0 max-lg:justify-start max-lg:gap-3 max-lg:px-3"
                        : "gap-3 px-3"
                } ${
                    active
                        ? "bg-weak-50 text-strong-950"
                        : "text-sub-600 hover:bg-weak-50/70 hover:text-blue-500"
                }`}
                aria-current={active ? "page" : undefined}
                aria-label={collapsed ? item.label : undefined}
                onClick={onNavigate}
            >
                <Icon
                    className={`shrink-0 transition-colors ${
                        active
                            ? "fill-strong-950"
                            : "fill-sub-600 group-hover:fill-blue-500"
                    }`}
                    name={item.icon}
                />
                {!collapsed && (
                    <span className="truncate">{item.label}</span>
                )}
                {collapsed && (
                    <span className="hidden truncate max-lg:inline">
                        {item.label}
                    </span>
                )}
            </Link>
        );
    };

    return (
        <nav className="flex flex-col gap-1" aria-label="Company navigation">
            {ITEMS.map(renderLeaf)}
            <button
                type="button"
                title="Settings"
                className={`group flex h-10 w-full items-center rounded-xl text-label-sm transition-colors ${
                    collapsed
                        ? "justify-center px-0 max-lg:justify-start max-lg:gap-3 max-lg:px-3"
                        : "gap-3 px-3"
                } ${
                    settingsOpen
                        ? "bg-weak-50 text-strong-950"
                        : "text-sub-600 hover:bg-weak-50/70 hover:text-blue-500"
                }`}
                aria-label={collapsed ? "Settings" : undefined}
                aria-current={settingsOpen ? "page" : undefined}
                onClick={() => {
                    onOpenSettings?.();
                    onNavigate?.();
                }}
            >
                <Icon
                    className={`shrink-0 transition-colors ${
                        settingsOpen
                            ? "fill-strong-950"
                            : "fill-sub-600 group-hover:fill-blue-500"
                    }`}
                    name="settings"
                />
                {!collapsed && <span className="truncate">Settings</span>}
                {collapsed && (
                    <span className="hidden truncate max-lg:inline">
                        Settings
                    </span>
                )}
            </button>
        </nav>
    );
};

export default CompanyNav;
