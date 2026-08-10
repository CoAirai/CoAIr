import type { Message, RecentQuery } from "./types";

export const SEED_THREADS_BY_USER: Record<string, Message[]> = {
    "u-001": [
        {
            id: "ada-u1",
            role: "user",
            content: "Summarize open risks on the Acme site.",
            createdAt: "2026-08-03T09:00:00.000Z",
            authorUserId: "u-001",
            authorName: "Ada Lovelace",
            threadUserId: "u-001",
        },
        {
            id: "ada-a1",
            role: "assistant",
            content:
                "Mock reply: Three open risks remain on the Acme site — edge protection, crane exclusion, and night lighting (Acme Site Safety Plan.pdf, p.3).",
            createdAt: "2026-08-03T09:00:02.000Z",
            threadUserId: "u-001",
            citations: [
                {
                    documentId: "doc-001",
                    name: "Acme Site Safety Plan.pdf",
                    page: 3,
                    excerpt:
                        "Open risks register: (1) incomplete edge protection on Grid C, (2) crane exclusion not marked at Gate 2, (3) night lighting gaps on the north elevation.",
                },
            ],
        },
    ],
    "u-002": [
        {
            id: "ben-u1",
            role: "user",
            content: "What does the safety plan say about crane lifts?",
            createdAt: "2026-08-02T14:00:00.000Z",
            authorUserId: "u-002",
            authorName: "Ben Carter",
            threadUserId: "u-002",
        },
        {
            id: "ben-a1",
            role: "assistant",
            content:
                "Mock reply: Crane lifts need a nominated lift supervisor and a cleared exclusion zone before any slew (Acme Site Safety Plan.pdf, p.2).",
            createdAt: "2026-08-02T14:00:02.000Z",
            threadUserId: "u-002",
            citations: [
                {
                    documentId: "doc-001",
                    name: "Acme Site Safety Plan.pdf",
                    page: 2,
                    excerpt:
                        "Crane lifts: a nominated lift supervisor must clear the exclusion zone before any slew. Banksmen remain in radio contact for the full lift.",
                },
            ],
        },
    ],
    "u-003": [
        {
            id: "clara-u1",
            role: "user",
            content: "Pull Q2 cost outliers from the tracker.",
            createdAt: "2026-08-01T11:30:00.000Z",
            authorUserId: "u-003",
            authorName: "Clara Nguyen",
            threadUserId: "u-003",
        },
        {
            id: "clara-a1",
            role: "assistant",
            content:
                "Mock reply: Q2 outliers are structural steel and weekend prelims (Q2 Cost Tracker.xlsx, p.1).",
            createdAt: "2026-08-01T11:30:02.000Z",
            threadUserId: "u-003",
            citations: [
                {
                    documentId: "doc-003",
                    name: "Q2 Cost Tracker.xlsx",
                    page: 1,
                    excerpt:
                        "Q2 outliers: structural steel (+18%) and weekend prelims (+11%). Remaining packages tracked within 4% of baseline.",
                },
            ],
        },
    ],
};

export const SEED_RECENTS_BY_USER: Record<string, RecentQuery[]> = {
    "u-001": [
        {
            id: "ada-q1",
            title: "Summarize open risks on the Acme site.",
            messages: SEED_THREADS_BY_USER["u-001"],
        },
    ],
    "u-002": [
        {
            id: "ben-q1",
            title: "What does the safety plan say about crane lifts?",
            messages: SEED_THREADS_BY_USER["u-002"],
        },
    ],
    "u-003": [
        {
            id: "clara-q1",
            title: "Pull Q2 cost outliers from the tracker.",
            messages: SEED_THREADS_BY_USER["u-003"],
        },
    ],
};
