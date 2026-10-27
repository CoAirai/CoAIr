"use client";

import { ThinkingOrb, type OrbState } from "thinking-orbs";
import type { ChatActivityStep } from "@/lib/coair/liveLogin";

const ORB_FOR_STEP: Record<string, OrbState> = {
    thinking: "working",
    routing: "shaping",
    searching: "searching",
    reading: "weaving",
    related: "connecting",
    analysing: "solving",
    tool: "shaping",
    answer: "composing",
    verifying: "connecting",
};

type Props = {
    activity: ChatActivityStep | null;
};

const ReplyOrb = ({ activity }: Props) => {
    const roles: Record<string, string> = {
        thinking: "Research coordinator", routing: "Research coordinator",
        searching: "Project retrieval", reading: "Source review",
        related: "Related evidence", analysing: "Evidence analysis",
        tool: "Research tools", answer: "Answer writer", verifying: "Answer check",
    };
    const role = roles[activity?.kind ?? "thinking"] ?? "Research coordinator";
    const state = (activity && ORB_FOR_STEP[activity.kind]) || "working";
    const raw = activity?.label?.trim() || "COAIr is thinking…";
    const label = raw.charAt(0).toUpperCase() + raw.slice(1);
    return (
        <div className="flex items-center gap-3 px-1" role="status" aria-live="polite">
            <ThinkingOrb state={state} size={64} aria-label={label} />
            <div className="min-w-0">
                <div className="mb-1 text-label-xs text-sub-600">{role}</div>
                <div className="truncate text-label-sm text-strong-950">{label}</div>
                {activity?.detail ? (
                    <div className="text-p-xs text-sub-600">{activity.detail}</div>
                ) : null}
            </div>
        </div>
    );
};

export default ReplyOrb;
