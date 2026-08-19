import type { AccessRequest } from "./accessRequests";

export const SEED_ACCESS_REQUESTS: AccessRequest[] = [
    {
        id: "ar-seed-001",
        fullName: "Maya Chen",
        email: "maya@northspan.example",
        companyName: "Northspan Works",
        createdAt: "2026-08-04T14:20:00.000Z",
        status: "pending",
    },
    {
        id: "ar-seed-002",
        fullName: "Omar Haddad",
        email: "omar@quarryline.example",
        companyName: "Quarryline Civil",
        createdAt: "2026-08-11T09:05:00.000Z",
        status: "pending",
    },
    {
        id: "ar-seed-003",
        fullName: "Priya Desai",
        email: "priya@lumenbridge.example",
        companyName: "Lumenbridge",
        createdAt: "2026-08-12T16:40:00.000Z",
        status: "pending",
    },
];
