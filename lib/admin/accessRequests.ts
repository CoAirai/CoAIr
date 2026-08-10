import { isValidInviteEmail } from "./wave2Helpers";
import type { PlanId } from "./types";

export type AccessRequestStatus = "pending" | "approved" | "denied";

export type AccessRequest = {
    id: string;
    fullName: string;
    email: string;
    companyName: string;
    createdAt: string;
    status: AccessRequestStatus;
    resolvedAt?: string;
    resolvedPlanId?: PlanId;
};

export type AccessRequestInput = {
    fullName: string;
    email: string;
    companyName: string;
};

export type AccessApproval = {
    fullName: string;
    email: string;
    companyName: string;
};

let requestSeq = 0;

function nextRequestId() {
    requestSeq += 1;
    return `ar-${requestSeq.toString().padStart(3, "0")}`;
}

export function createAccessRequest(
    existing: AccessRequest[],
    existingUsers: { email: string }[],
    input: AccessRequestInput,
    now = new Date()
): { ok: true; request: AccessRequest } | { ok: false; error: string } {
    const fullName = input.fullName.trim();
    const email = input.email.trim().toLowerCase();
    const companyName = input.companyName.trim();

    if (!fullName) {
        return { ok: false, error: "Full name required" };
    }
    if (!isValidInviteEmail(email)) {
        return { ok: false, error: "Valid work email required" };
    }
    if (!companyName) {
        return { ok: false, error: "Company name required" };
    }
    if (
        existing.some(
            (request) =>
                request.status === "pending" &&
                request.email.toLowerCase() === email
        )
    ) {
        return {
            ok: false,
            error: "A pending request already exists for this email",
        };
    }
    if (
        existingUsers.some((user) => user.email.toLowerCase() === email)
    ) {
        return { ok: false, error: "This email already has a COAir account" };
    }

    return {
        ok: true,
        request: {
            id: nextRequestId(),
            fullName,
            email,
            companyName,
            createdAt: now.toISOString(),
            status: "pending",
        },
    };
}

export function approveAccessRequest(
    requests: AccessRequest[],
    requestId: string,
    now = new Date()
):
    | { ok: true; requests: AccessRequest[]; approval: AccessApproval }
    | { ok: false; error: string } {
    const target = requests.find((request) => request.id === requestId);
    if (!target) {
        return { ok: false, error: "Request not found" };
    }
    if (target.status !== "pending") {
        return { ok: false, error: "Request is no longer pending" };
    }

    const resolved: AccessRequest = {
        ...target,
        status: "approved",
        resolvedAt: now.toISOString(),
    };

    return {
        ok: true,
        requests: requests.map((request) =>
            request.id === requestId ? resolved : request
        ),
        approval: {
            fullName: target.fullName,
            email: target.email,
            companyName: target.companyName,
        },
    };
}

export function denyAccessRequest(
    requests: AccessRequest[],
    requestId: string,
    now = new Date()
): { ok: true; requests: AccessRequest[] } | { ok: false; error: string } {
    const target = requests.find((request) => request.id === requestId);
    if (!target) {
        return { ok: false, error: "Request not found" };
    }
    if (target.status !== "pending") {
        return { ok: false, error: "Request is no longer pending" };
    }

    return {
        ok: true,
        requests: requests.map((request) =>
            request.id === requestId
                ? {
                      ...request,
                      status: "denied" as const,
                      resolvedAt: now.toISOString(),
                  }
                : request
        ),
    };
}

export function pendingAccessRequests(requests: AccessRequest[]) {
    return requests
        .filter((request) => request.status === "pending")
        .slice()
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
