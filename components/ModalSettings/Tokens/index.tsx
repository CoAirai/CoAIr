"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    createMemberTokenRequest,
    listMemberTokenRequests,
    readAuthMe,
    type CoairMemberTokenRequest,
} from "@/lib/coair/org";
import { apiErrorMessage } from "@/lib/coair/commerce";

const fmt = new Intl.NumberFormat("en-US");

const Tokens = () => {
    const { session } = useAuth();
    const token = session?.accessToken ?? "";
    const live = session?.source === "live" && Boolean(token);
    const [used, setUsed] = useState(0);
    const [limit, setLimit] = useState(0);
    const [tokens, setTokens] = useState("1000");
    const [reason, setReason] = useState("");
    const [requests, setRequests] = useState<CoairMemberTokenRequest[]>([]);
    const [message, setMessage] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = async () => {
        if (!live) return;
        try {
            const [me, listed] = await Promise.all([
                readAuthMe(token),
                listMemberTokenRequests(token),
            ]);
            setUsed(me.user?.used_tokens ?? 0);
            setLimit(me.user?.token_limit ?? 0);
            setRequests(listed.requests ?? []);
        } catch (err) {
            setMessage(apiErrorMessage(err));
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [live, token]);

    const remaining = Math.max(0, limit - used);

    const onSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!live) {
            setMessage("Sign in with a live account to request tokens.");
            return;
        }
        const amount = Number(tokens);
        if (!Number.isFinite(amount) || amount < 1) {
            setMessage("Enter a positive token amount.");
            return;
        }
        setBusy(true);
        setMessage(null);
        try {
            await createMemberTokenRequest(token, {
                tokens: Math.floor(amount),
                reason: reason.trim(),
            });
            setReason("");
            setMessage("Request sent to your company admin.");
            await load();
        } catch (err) {
            setMessage(apiErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <p className="mb-4 text-label-sm text-sub-600">
                Your share of the company token pool. Request more when you need
                headroom; your company admin can transfer unused tokens or buy
                more.
            </p>
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-stroke-soft-200 p-3">
                    <div className="text-label-xs text-sub-600">Used</div>
                    <div className="mt-1 text-label-lg tabular-nums">
                        {fmt.format(used)}
                    </div>
                </div>
                <div className="rounded-xl border border-stroke-soft-200 p-3">
                    <div className="text-label-xs text-sub-600">Limit</div>
                    <div className="mt-1 text-label-lg tabular-nums">
                        {fmt.format(limit)}
                    </div>
                </div>
                <div className="rounded-xl border border-stroke-soft-200 p-3">
                    <div className="text-label-xs text-sub-600">Remaining</div>
                    <div className="mt-1 text-label-lg tabular-nums">
                        {fmt.format(remaining)}
                    </div>
                </div>
            </div>

            <form onSubmit={(event) => void onSubmit(event)} className="space-y-3">
                <div>
                    <label className="text-label-sm text-strong-950">
                        Request more tokens
                    </label>
                    <input
                        type="number"
                        min={1}
                        value={tokens}
                        onChange={(event) => setTokens(event.target.value)}
                        className="mt-1 h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm"
                    />
                </div>
                <div>
                    <label className="text-label-sm text-strong-950">
                        Reason (optional)
                    </label>
                    <textarea
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        rows={3}
                        maxLength={400}
                        className="mt-1 w-full rounded-xl border border-stroke-soft-200 px-3 py-2 text-label-sm"
                        placeholder="What do you need the tokens for?"
                    />
                </div>
                <button
                    type="submit"
                    disabled={busy}
                    className="h-10 rounded-full bg-blue-500 px-4 text-label-sm text-white-0 disabled:opacity-60"
                >
                    {busy ? "Sending…" : "Send request"}
                </button>
            </form>

            {message ? (
                <p className="mt-3 text-label-xs text-sub-600">{message}</p>
            ) : null}

            {requests.length > 0 ? (
                <div className="mt-6">
                    <div className="mb-2 text-label-sm text-strong-950">
                        Your requests
                    </div>
                    <ul className="divide-y divide-stroke-soft-200 rounded-xl border border-stroke-soft-200">
                        {requests.slice(0, 8).map((req) => (
                            <li
                                key={req.id}
                                className="flex items-center justify-between gap-3 px-3 py-2 text-label-xs"
                            >
                                <span className="text-strong-950 tabular-nums">
                                    {fmt.format(req.tokens)} tokens
                                </span>
                                <span className="text-sub-600 capitalize">
                                    {req.status}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </div>
    );
};

export default Tokens;
