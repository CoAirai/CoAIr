"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import AnimateHeight from "react-animate-height";
import Icon from "@/components/Icon";

type NavLeaf = {
    href: string;
    label: string;
    icon: string;
};

type NavGroup = {
    id: string;
    label: string;
    icon: string;
    items: NavLeaf[];
};

const DASHBOARD: NavLeaf = {
    href: "/admin",
    label: "Dashboard",
    icon: "analytic",
};

const GROUPS: NavGroup[] = [
    {
        id: "tenants",
        label: "Tenants",
        icon: "team",
        items: [
            {
                href: "/admin/onboarding",
                label: "Onboarding",
                icon: "document-check",
            },
            { href: "/admin/companies", label: "Companies", icon: "folder" },
            { href: "/admin/users", label: "Users", icon: "profile" },
            { href: "/admin/roles", label: "Roles & Rights", icon: "check" },
        ],
    },
    {
        id: "usage",
        label: "Usage",
        icon: "flash",
        items: [
            { href: "/admin/tokens", label: "Tokens", icon: "flash" },
            { href: "/admin/storage", label: "Storage", icon: "database" },
            { href: "/admin/models", label: "Models", icon: "build" },
        ],
    },
    {
        id: "billing",
        label: "Billing",
        icon: "gift",
        items: [
            { href: "/admin/billing", label: "Billing", icon: "gift" },
            { href: "/admin/topups", label: "Top-ups", icon: "plus" },
            { href: "/admin/alerts", label: "Alerts", icon: "bell" },
            {
                href: "/admin/overage",
                label: "Overage",
                icon: "alert-circle",
            },
            { href: "/admin/dunning", label: "Dunning", icon: "history" },
            { href: "/admin/reports", label: "Reports", icon: "document" },
        ],
    },
    {
        id: "platform",
        label: "Platform",
        icon: "wrench",
        items: [
            { href: "/admin/packages", label: "Packages", icon: "gift" },
            { href: "/admin/security", label: "Security", icon: "security" },
            { href: "/admin/tickets", label: "Tickets", icon: "comment" },
            { href: "/admin/ops", label: "Ops", icon: "browser" },
            { href: "/admin/analytics", label: "Analytics", icon: "analytic" },
            {
                href: "/admin/audit",
                label: "Audit log",
                icon: "document-check",
            },
        ],
    },
];

const isActiveHref = (pathname: string, href: string) =>
    href === "/admin" ? pathname === href : pathname.startsWith(href);

const findActiveGroupId = (pathname: string) =>
    GROUPS.find((group) =>
        group.items.some((item) => isActiveHref(pathname, item.href))
    )?.id;

type Props = {
    onNavigate?: () => void;
    onExpandSidebar?: () => void;
    collapsed?: boolean;
};

const AdminNav = ({ onNavigate, onExpandSidebar, collapsed = false }: Props) => {
    const pathname = usePathname();
    const [openGroupId, setOpenGroupId] = useState<string | null>(
        () => findActiveGroupId(pathname) ?? null
    );

    useEffect(() => {
        const activeGroupId = findActiveGroupId(pathname);
        if (activeGroupId) {
            setOpenGroupId(activeGroupId);
        }
    }, [pathname]);

    const handleGroupClick = (groupId: string) => {
        if (collapsed) {
            onExpandSidebar?.();
            setOpenGroupId(groupId);
            return;
        }
        setOpenGroupId((current) => (current === groupId ? null : groupId));
    };

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

    const renderGroup = (group: NavGroup) => {
        const groupActive = group.items.some((item) =>
            isActiveHref(pathname, item.href)
        );
        const open = openGroupId === group.id;

        return (
            <div key={group.id} className="flex flex-col gap-1">
                <button
                    type="button"
                    title={group.label}
                    className={`group flex h-10 w-full items-center rounded-xl text-label-sm transition-colors ${
                        collapsed
                            ? "justify-center px-0 max-lg:justify-start max-lg:gap-3 max-lg:px-3"
                            : "gap-3 px-3"
                    } ${
                        groupActive
                            ? "text-strong-950"
                            : "text-sub-600 hover:bg-weak-50/70 hover:text-blue-500"
                    }`}
                    aria-expanded={open}
                    aria-label={collapsed ? group.label : undefined}
                    onClick={() => handleGroupClick(group.id)}
                >
                    <Icon
                        className={`shrink-0 transition-colors ${
                            groupActive
                                ? "fill-strong-950"
                                : "fill-sub-600 group-hover:fill-blue-500"
                        }`}
                        name={group.icon}
                    />
                    {!collapsed && (
                        <span className="min-w-0 grow truncate text-left">
                            {group.label}
                        </span>
                    )}
                    {collapsed && (
                        <span className="hidden min-w-0 grow truncate text-left max-lg:inline">
                            {group.label}
                        </span>
                    )}
                    <Icon
                        className={`shrink-0 transition-transform ${
                            open ? "rotate-180" : ""
                        } ${collapsed ? "hidden max-lg:block" : "block"} ${
                            groupActive ? "fill-strong-950" : "fill-sub-600"
                        }`}
                        name="chevron"
                    />
                </button>

                <div
                    className={`overflow-hidden ${
                        collapsed ? "hidden max-lg:block" : "block"
                    }`}
                >
                    <AnimateHeight duration={250} height={open ? "auto" : 0}>
                        <div className="ml-2.5 flex flex-col gap-1 border-l border-stroke-soft-200 py-1 pl-2.5">
                            {group.items.map(renderLeaf)}
                        </div>
                    </AnimateHeight>
                </div>
            </div>
        );
    };

    return (
        <nav className="flex flex-col gap-1" aria-label="Admin navigation">
            {renderLeaf(DASHBOARD)}
            {GROUPS.map(renderGroup)}
        </nav>
    );
};

export default AdminNav;
