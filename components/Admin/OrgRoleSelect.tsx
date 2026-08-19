"use client";

import {
    ORG_ROLE_OPTIONS,
    type OrgRole,
} from "@/lib/admin/rolesStub";

type Props = {
    value: string;
    disabled?: boolean;
    onChange: (role: OrgRole) => void;
};

const OrgRoleSelect = ({ value, disabled, onChange }: Props) => {
    const selected = value === "owner" ? "owner" : "member";
    return (
        <select
            value={selected}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value as OrgRole)}
            className="h-8 rounded-lg border border-stroke-soft-200 px-2 text-label-xs outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
            {ORG_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    );
};

export default OrgRoleSelect;
