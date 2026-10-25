"use client";
import { FormEvent, useState } from "react";
import { useAuth } from "@/context/AuthContext";

export default function ChangePasswordPage() {
    const { session, ready, changePassword } = useAuth();
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    async function submit(event: FormEvent) {
        event.preventDefault();
        if (next !== confirm) { setError("Passwords do not match."); return; }
        setBusy(true); setError("");
        try {
            const result = await changePassword(current, next);
            if (!result.ok) { setError(result.error || "Password change failed."); return; }
            window.location.assign("/workspace");
        } finally { setBusy(false); }
    }
    if (!ready) return <main className="p-8">Loading…</main>;
    if (!session) return <main className="p-8"><a href="/auth/sign-in">Sign in</a></main>;
    return <main className="mx-auto max-w-md p-8">
        <h1 className="text-2xl font-semibold">Set your own password</h1>
        <p className="my-4">Replace your temporary password before using your documents. Use at least 12 characters.</p>
        <form onSubmit={submit} className="space-y-4">
            <label className="block">Temporary / current password<input type="password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} className="block w-full rounded border p-2" /></label>
            <label className="block">New password<input type="password" autoComplete="new-password" minLength={12} maxLength={72} required value={next} onChange={e => setNext(e.target.value)} className="block w-full rounded border p-2" /></label>
            <label className="block">Confirm new password<input type="password" autoComplete="new-password" minLength={12} maxLength={72} required value={confirm} onChange={e => setConfirm(e.target.value)} className="block w-full rounded border p-2" /></label>
            {error && <p role="alert" className="text-red-600">{error}</p>}
            <button disabled={busy} className="rounded bg-blue-700 px-4 py-2 text-white">{busy ? "Saving…" : "Change password"}</button>
        </form>
    </main>;
}
