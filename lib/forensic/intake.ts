import type { ForensicProgrammeWorkspace, ForensicXerFile } from "./types";

export const MAX_PROGRAMME_SET_MB = 75;

export function totalProgrammeSizeMb(files: Pick<ForensicXerFile, "sizeMb">[]) {
    return Number(
        files.reduce((sum, file) => sum + file.sizeMb, 0).toFixed(2)
    );
}

export function canCreateProgrammeWorkspace(
    selected: Pick<ForensicXerFile, "sizeMb">[]
) {
    return (
        selected.length > 0 &&
        totalProgrammeSizeMb(selected) <= MAX_PROGRAMME_SET_MB
    );
}

export function buildProgrammeWorkspace(input: {
    id: string;
    companyId: string;
    ownerUserId?: string;
    name: string;
    programmeIds: string[];
    now: Date;
}): ForensicProgrammeWorkspace {
    const name = input.name.trim() || "Programme Analysis";
    if (input.programmeIds.length === 0) {
        throw new Error("Select at least one programme");
    }
    return {
        id: input.id,
        companyId: input.companyId,
        ownerUserId: input.ownerUserId,
        name,
        programmeIds: [...input.programmeIds],
        createdAt: input.now.toISOString(),
    };
}
