export type ForensicModuleRequirement = {
    files: number;
    extra?: string;
};

/** Matches the live engine. Modules with `extra` stay blocked in the UI. */
export const FORENSIC_MODULE_REQUIREMENTS: Record<string, ForensicModuleRequirement> = {
    intake: { files: 1 },
    dcma: { files: 1 },
    "baseline-critical-path": { files: 1 },
    "revision-comparison": { files: 2 },
    "out-of-sequence": { files: 1 },
    "float-erosion": { files: 2 },
    "progress-s-curve": { files: 2 },
    "resource-loading": { files: 1 },
    "sequence-coding": { files: 1 },
    hierarchy: { files: 1 },
    "milestone-shift": { files: 2 },
    "progress-transfer": { files: 2 },
    "as-built-critical-path": { files: 1 },
    "report-assembler": { files: 1 },
    "as-planned-vs-as-built": { files: 2 },
    "windows-analysis": { files: 2 },
    "impacted-as-planned": {
        files: 1,
        extra: "Needs a delay event before this model can run.",
    },
    "collapsed-as-built": {
        files: 1,
        extra: "Needs a delay event before this model can run.",
    },
    "time-impact-analysis": {
        files: 1,
        extra: "Needs a delay event before this model can run.",
    },
    "evidence-led-draft": {
        files: 1,
        extra: "Needs cited evidence inputs before this model can run.",
    },
};

export function forensicRequirementCopy(id: string, programmeCount: number) {
    const requirement = FORENSIC_MODULE_REQUIREMENTS[id];
    if (!requirement) return "";
    if (requirement.extra) return requirement.extra;
    const needed = requirement.files;
    const noun = needed === 1 ? "programme file" : "programme files";
    if (programmeCount < needed) {
        return `Needs ${needed} ${noun}. This workspace has ${programmeCount}.`;
    }
    return `Ready with ${programmeCount} programme file${programmeCount === 1 ? "" : "s"}.`;
}
