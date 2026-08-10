export type ForensicToolId =
    | "intake"
    | "dcma"
    | "baseline-critical-path"
    | "revision-comparison"
    | "out-of-sequence"
    | "float-erosion"
    | "progress-s-curve"
    | "resource-loading"
    | "sequence-coding"
    | "hierarchy"
    | "milestone-shift"
    | "progress-transfer"
    | "as-built-critical-path"
    | "report-assembler"
    | "as-planned-vs-as-built"
    | "windows-analysis"
    | "impacted-as-planned"
    | "collapsed-as-built"
    | "time-impact-analysis"
    | "evidence-led-draft";

export type ForensicNavItem = {
    id: ForensicToolId;
    label: string;
    href: string;
    summary: string;
};

export type ForensicNavGroup = {
    id: string;
    label: string;
    items: ForensicNavItem[];
};

export const FORENSIC_NAV_GROUPS: ForensicNavGroup[] = [
    {
        id: "programme",
        label: "Forensic programme analyses",
        items: [
            {
                id: "intake",
                label: "Intake",
                href: "/workspace/forensic",
                summary: "Upload XER programmes and create an analysis workspace.",
            },
            {
                id: "dcma",
                label: "DCMA",
                href: "/workspace/forensic/dcma",
                summary: "14-point programme quality check on the selected workspace.",
            },
            {
                id: "baseline-critical-path",
                label: "Baseline Critical Path",
                href: "/workspace/forensic/baseline-critical-path",
                summary: "Extract the baseline driving path and total float.",
            },
            {
                id: "revision-comparison",
                label: "Revision Comparison",
                href: "/workspace/forensic/revision-comparison",
                summary: "Diff dates, logic and constraints between two XER revisions.",
            },
            {
                id: "out-of-sequence",
                label: "Out-of-Sequence",
                href: "/workspace/forensic/out-of-sequence",
                summary: "Find progress that broke planned logic relationships.",
            },
            {
                id: "float-erosion",
                label: "Float Erosion",
                href: "/workspace/forensic/float-erosion",
                summary: "Track total and free float loss across updates.",
            },
            {
                id: "progress-s-curve",
                label: "Progress S-Curve",
                href: "/workspace/forensic/progress-s-curve",
                summary: "Planned versus actual progress curves from the programmes.",
            },
            {
                id: "resource-loading",
                label: "Resource Loading",
                href: "/workspace/forensic/resource-loading",
                summary: "Review resource histograms and over-allocation.",
            },
            {
                id: "sequence-coding",
                label: "Sequence Coding",
                href: "/workspace/forensic/sequence-coding",
                summary: "Map activity codes used to group the forensic sequence.",
            },
            {
                id: "hierarchy",
                label: "Hierarchy",
                href: "/workspace/forensic/hierarchy",
                summary: "WBS / EPS structure of the selected programmes.",
            },
            {
                id: "milestone-shift",
                label: "Milestone Shift",
                href: "/workspace/forensic/milestone-shift",
                summary: "Measure contractual and internal milestone movement.",
            },
            {
                id: "progress-transfer",
                label: "Progress Transfer",
                href: "/workspace/forensic/progress-transfer",
                summary: "Reconcile claimed progress between successive updates.",
            },
            {
                id: "as-built-critical-path",
                label: "As-Built Critical Path",
                href: "/workspace/forensic/as-built-critical-path",
                summary: "Rebuild the as-built driving path at the data date.",
            },
            {
                id: "report-assembler",
                label: "Report Assembler",
                href: "/workspace/forensic/report-assembler",
                summary: "Assemble selected analyses into a downloadable report.",
            },
        ],
    },
    {
        id: "retrospective",
        label: "Retrospective",
        items: [
            {
                id: "as-planned-vs-as-built",
                label: "As-Planned vs. As-Built",
                href: "/workspace/forensic/as-planned-vs-as-built",
                summary: "Compare the planned sequence with what actually occurred.",
            },
            {
                id: "windows-analysis",
                label: "Windows Analysis",
                href: "/workspace/forensic/windows-analysis",
                summary: "Split delay into successive windows and isolate each impact.",
            },
            {
                id: "impacted-as-planned",
                label: "Impacted As-Planned",
                href: "/workspace/forensic/impacted-as-planned",
                summary: "Insert delay events into the baseline and measure effect.",
            },
            {
                id: "collapsed-as-built",
                label: "Collapsed As-Built",
                href: "/workspace/forensic/collapsed-as-built",
                summary: "Remove delay events from the as-built to test causation.",
            },
        ],
    },
    {
        id: "prospective",
        label: "Prospective",
        items: [
            {
                id: "time-impact-analysis",
                label: "Time Impact Analysis",
                href: "/workspace/forensic/time-impact-analysis",
                summary: "Model remaining delay from the current data date.",
            },
            {
                id: "evidence-led-draft",
                label: "Evidence-led Forensic Draft",
                href: "/workspace/forensic/evidence-led-draft",
                summary: "Draft narrative findings cited to programme evidence.",
            },
        ],
    },
];

export const FORENSIC_TOOLS = FORENSIC_NAV_GROUPS.flatMap((group) => group.items);

export function getForensicTool(id: string) {
    return FORENSIC_TOOLS.find((item) => item.id === id) ?? null;
}
