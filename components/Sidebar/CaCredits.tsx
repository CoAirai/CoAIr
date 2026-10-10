"use client";

import { useMemo } from "react";

import { useAdminData } from "@/context/AdminDataContext";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import { useLiveWorkspace } from "@/context/LiveWorkspaceContext";
import { getTokenMeter } from "@/lib/chat/tokenMeter";
import TokenUsage from "./TokenUsage";

const CaCredits = () => {
    const { session } = useAuth();
    const { companies, users } = useAdminData();
    const { activeWorkspaceUserId } = useChat();
    const live = useLiveWorkspace();

    const tokenMeter = useMemo(() => {
        if (live.enabled) {
            const selected = live.orgUsers.find(
                (entry) => entry.username === activeWorkspaceUserId
            );
            if (selected) {
                const used = selected.used_tokens ?? 0;
                const limit = selected.token_limit ?? 0;
                return getTokenMeter({
                    tokenLimit: limit,
                    tokensUsed: used,
                    personalTokensUsed: used,
                });
            }
            if (live.accountUsage) {
                const used = live.accountUsage.used_tokens ?? 0;
                const limit = live.accountUsage.token_limit ?? 0;
                return getTokenMeter({
                    tokenLimit: limit,
                    tokensUsed: used,
                    personalTokensUsed: used,
                });
            }
            return null;
        }
        const company = companies.find((entry) => entry.id === session?.companyId);
        const user = users.find((entry) => entry.id === activeWorkspaceUserId);
        if (!company || !user) return null;
        return getTokenMeter({
            tokenLimit: company.tokenLimit,
            tokensUsed: company.tokensUsed,
            tokenSharePercent: user.tokenSharePercent,
            personalTokensUsed: user.personalTokensUsed,
            unusedReleased: user.unusedReleased,
        });
    }, [
        activeWorkspaceUserId,
        companies,
        live.accountUsage,
        live.enabled,
        live.orgUsers,
        session?.companyId,
        users,
    ]);

    return (
        <div className="mb-3 flex min-h-11 items-center gap-2 rounded-xl px-3 py-1 text-label-sm text-strong-950">
            <span className="min-w-0">
                <span className="block truncate">CA credits</span>
                <span className="block truncate text-[10px] leading-4 text-sub-600">
                    Chat, chronology, forensic
                </span>
            </span>
            {tokenMeter ? (
                <TokenUsage
                    used={tokenMeter.used}
                    allocation={tokenMeter.allocation}
                    remainingPercent={tokenMeter.remainingPercent}
                    showGemini={false}
                />
            ) : null}
        </div>
    );
};

export default CaCredits;
