import type { Company, ModuleId, Plan } from "../admin/types";
import { rightsFromFeatures, type RightKey } from "../admin/rolesStub";
import type { SessionRole } from "../auth/resolveLogin";

export type ModuleGate =
    | { state: "open"; kind: "included" | "trial" | "addon"; trialRemaining?: number }
    | {
          state: "locked";
          reason: "addon" | "trial_exhausted" | "user_denied";
      };

export const MODULES: {
    id: ModuleId;
    number: string;
    title: string;
    keywords: string;
    description: string;
    href: string;
}[] = [
    {
        id: "chatbot",
        number: "01",
        title: "QUERIS",
        keywords: "Enquiry",
        description:
            "Ask anything about your project. Every answer cites the document and page it came from.",
        href: "/workspace/chat",
    },
    {
        id: "chronology",
        number: "02",
        title: "CHRONOS",
        keywords: "Event Chronology",
        description:
            "A defensible sequence of events, built from the record rather than from memory.",
        href: "/workspace/chronology",
    },
    {
        id: "forensic",
        number: "03",
        title: "FORENSIS",
        keywords: "Forensic Analysis",
        description:
            "Programme reviews, preliminary delay findings and EoT claim assessments — a defensible first pass, aligned to SCL and AACE.",
        href: "/workspace/forensic",
    },
];

const MODULE_LOGOS: { href: string; src: string; alt: string }[] = [
    { href: "/workspace/chat", src: "/images/modules/queris.png", alt: "QUERIS" },
    { href: "/workspace/chronology", src: "/images/modules/chronos.png", alt: "CHRONOS" },
    { href: "/workspace/forensic", src: "/images/modules/forensis.png", alt: "FORENSIS" },
];

/** The module's mark inside a module, the COAIr logo everywhere else. */
export function workspaceLogo(pathname: string): { src: string; alt: string } {
    const found = MODULE_LOGOS.find((entry) => pathname.startsWith(entry.href));
    return found ?? { src: "/images/coair-logo.png", alt: "COAIr" };
}

function sessionRoleToOrgRole(role?: SessionRole | string | null): string {
    if (
        role === "company_admin" ||
        role === "super_admin" ||
        role === "owner" ||
        role === "admin"
    ) {
        return "owner";
    }
    return "member";
}

/** Per-user Super Admin / company-admin rights toggles. Chatbot is always allowed. */
export function userMayAccessModule(
    moduleId: ModuleId,
    features?: Record<string, boolean> | null,
    sessionRole?: SessionRole | string | null
): boolean {
    if (moduleId === "chatbot") return true;
    if (moduleId !== "chronology" && moduleId !== "forensic") return true;
    const rights = rightsFromFeatures(
        features,
        sessionRoleToOrgRole(sessionRole)
    );
    return rights[moduleId as RightKey];
}

export type ModuleGateUser = {
    features?: Record<string, boolean> | null;
    role?: SessionRole | string | null;
};

export function getModuleGate(
    plan: Plan,
    company: Pick<Company, "addOns" | "trialUsage">,
    moduleId: ModuleId,
    user?: ModuleGateUser
): ModuleGate {
    // Chronology/Forensic: company unlock (addOns) before per-user rights.
    if (moduleId === "chronology" || moduleId === "forensic") {
        if (!company.addOns.includes(moduleId)) {
            return { state: "locked", reason: "addon" };
        }
        if (user && !userMayAccessModule(moduleId, user.features, user.role)) {
            return { state: "locked", reason: "user_denied" };
        }
        return { state: "open", kind: "addon" };
    }

    if (user && !userMayAccessModule(moduleId, user.features, user.role)) {
        return { state: "locked", reason: "user_denied" };
    }

    const rule = plan.modules[moduleId];
    if (!rule || rule.access === "included") {
        return { state: "open", kind: "included" };
    }

    if (rule.access === "trial") {
        const limit = rule.trialReports ?? 1;
        const used = company.trialUsage[moduleId] ?? 0;
        const remaining = Math.max(0, limit - used);
        if (remaining > 0) {
            return { state: "open", kind: "trial", trialRemaining: remaining };
        }
        return { state: "locked", reason: "trial_exhausted" };
    }

    if (company.addOns.includes(moduleId)) {
        return { state: "open", kind: "addon" };
    }

    return { state: "locked", reason: "addon" };
}

export function moduleStatusLabel(gate: ModuleGate): string {
    if (gate.state === "locked") {
        if (gate.reason === "user_denied") return "Request access";
        return "Locked";
    }
    if (gate.kind === "trial") {
        return `Trial (${gate.trialRemaining} left)`;
    }
    return "Live";
}
