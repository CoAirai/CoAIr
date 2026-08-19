export const ORG_ROLE_OPTIONS = [
    { value: "owner", label: "Company admin" },
    { value: "member", label: "Member" },
] as const;

export type OrgRole = (typeof ORG_ROLE_OPTIONS)[number]["value"];

export function isOrgRole(value: string): value is OrgRole {
    return value === "owner" || value === "member";
}

export type RightKey =
    | "projectAccess"
    | "chronology"
    | "forensic"
    | "upload"
    | "download"
    | "reports";

export const RIGHT_COLUMNS: Array<{ key: RightKey; label: string }> = [
    { key: "projectAccess", label: "Projects" },
    { key: "chronology", label: "Chronology" },
    { key: "forensic", label: "Forensic" },
    { key: "upload", label: "Upload" },
    { key: "download", label: "Download" },
    { key: "reports", label: "Reports" },
];

export type RoleRow = {
    id: string;
    name: string;
    email: string;
    companyName: string;
    role: string;
    rights: Record<RightKey, boolean>;
};

export function ownerRights(): Record<RightKey, boolean> {
    return {
        projectAccess: true,
        chronology: true,
        forensic: true,
        upload: true,
        download: true,
        reports: true,
    };
}

export function memberRights(): Record<RightKey, boolean> {
    return {
        projectAccess: true,
        chronology: true,
        forensic: false,
        upload: true,
        download: false,
        reports: false,
    };
}

export function viewerRights(): Record<RightKey, boolean> {
    return {
        projectAccess: true,
        chronology: true,
        forensic: false,
        upload: false,
        download: false,
        reports: false,
    };
}

export function rightsForRole(role: string): Record<RightKey, boolean> {
    const normalized = role.trim().toLowerCase();
    if (
        normalized === "admin" ||
        normalized === "owner" ||
        normalized === "super_admin"
    ) {
        return ownerRights();
    }
    if (normalized === "viewer") {
        return viewerRights();
    }
    return memberRights();
}

export function rightsFromFeatures(
    features: Record<string, unknown> | null | undefined,
    role: string
): Record<RightKey, boolean> {
    const defaults = rightsForRole(role);
    const source = features ?? {};
    const hasExplicit = RIGHT_COLUMNS.some((column) => column.key in source);
    if (!hasExplicit) return defaults;
    return {
        projectAccess: Boolean(source.projectAccess ?? defaults.projectAccess),
        chronology: Boolean(source.chronology ?? defaults.chronology),
        forensic: Boolean(source.forensic ?? defaults.forensic),
        upload: Boolean(source.upload ?? defaults.upload),
        download: Boolean(source.download ?? defaults.download),
        reports: Boolean(source.reports ?? defaults.reports),
    };
}

export function mergeRightFeatures(
    existing: Record<string, unknown> | null | undefined,
    rights: Record<RightKey, boolean>
): Record<string, boolean> {
    const next: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(existing ?? {})) {
        if (typeof value === "boolean") next[key] = value;
    }
    for (const column of RIGHT_COLUMNS) {
        next[column.key] = rights[column.key];
    }
    return next;
}

export function toggleRightInFeatures(
    existing: Record<string, unknown> | null | undefined,
    role: string,
    key: RightKey,
    enabled: boolean
): Record<string, boolean> {
    const next = { ...rightsFromFeatures(existing, role), [key]: enabled };
    return mergeRightFeatures(existing, next);
}

export function roleRowsFromPeople(
    people: Array<{
        id: string;
        name: string;
        email: string;
        companyName: string;
        role: string;
        features?: Record<string, unknown> | null;
        rights?: Record<RightKey, boolean>;
    }>
): RoleRow[] {
    return people.map((person) => ({
        id: person.id,
        name: person.name,
        email: person.email,
        companyName: person.companyName,
        role: person.role,
        rights:
            person.rights ??
            rightsFromFeatures(person.features, person.role),
    }));
}
