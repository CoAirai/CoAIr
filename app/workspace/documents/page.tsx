"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useLiveWorkspace } from "@/context/LiveWorkspaceContext";
import { COAIR_API_BASE, coairFetch } from "@/lib/coair/client";

type Review = { extraction?: { status?: string; review_reasons?: string[]; model?: string }; version: number; pages: Record<string, string>; metadata: Record<string, string> };
type FileItem = { id: string; name: string; status: string };
const labels: Record<string, string> = { title: "Belge başlığı", summary: "Özet", people: "Kişiler (satır başına bir isim)", organizations: "Kurumlar (satır başına bir kurum)", date: "Belge tarihi", sender: "Gönderen", recipient: "Alıcı", subject: "Konu", doc_type: "Belge türü" };

export default function LocalDocuments() {
    const { session, ready } = useAuth();
    const live = useLiveWorkspace();
    const [inbox, setInbox] = useState<{ path: string; bytes: number }[]>([]);
    const [files, setFiles] = useState<FileItem[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [review, setReview] = useState<Review | null>(null);
    const [activeFile, setActiveFile] = useState<FileItem | null>(null);
    const [page, setPage] = useState("1");
    const [preview, setPreview] = useState("");
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);
    const [filter, setFilter] = useState("");
    const token = session?.accessToken;
    const projectId = session?.projectId;
    const refresh = useCallback(async () => {
        if (!token || !projectId) return;
        const docs = await coairFetch<FileItem[]>("/files", { token, projectId });
        setFiles(docs);
        try {
            const result = await coairFetch<{ files: { path: string; bytes: number }[] }>("/local/inbox", { token, projectId });
            setInbox(result.files);
        } catch (error) { setMessage(error instanceof Error ? error.message : "Klasör okunamadı"); }
    }, [token, projectId]);
    useEffect(() => { void refresh().catch(error => setMessage(String(error))); }, [refresh]);
    useEffect(() => {
        if (!token || !projectId) return;
        const timer = setInterval(() => {
            void coairFetch<FileItem[]>("/files", { token, projectId }).then(setFiles).catch(() => {});
        }, 5000);
        return () => clearInterval(timer);
    }, [token, projectId]);
    useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
    const run = async (action: () => Promise<void>) => {
        setBusy(true); setMessage("");
        try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
        finally { setBusy(false); }
    };
    const open = async (file: FileItem) => {
        setReview(null); setPreview(""); setActiveFile(file);
        const value = await coairFetch<Review>(`/local/documents/${file.id}/review`, { token, projectId });
        setReview(value); setPage(Object.keys(value.pages)[0] || "1");
        const res = await fetch(`${COAIR_API_BASE}/local/documents/${file.id}/original`, {
            headers: { Authorization: `Bearer ${token}`, "X-Project-ID": projectId || "" },
        });
        if (!res.ok) throw new Error("Orijinal dosya açılamadı");
        setPreview(URL.createObjectURL(await res.blob()));
    };
    if (!ready) return <main className="p-8">Yükleniyor…</main>;
    if (!token) return <main className="p-8"><Link href="/auth/sign-in">Giriş yapın</Link></main>;
    return <main className="min-h-screen bg-white p-6 text-slate-900 dark:bg-slate-950 dark:text-white">
        <header className="mb-6 flex flex-wrap items-center gap-4">
            <Link href="/workspace" className="underline">← Çalışma alanı</Link>
            <h1 className="text-2xl font-semibold">Belgeler ve çıkarım incelemesi</h1>
            <select aria-label="Proje" value={projectId || ""} onChange={event => { live.selectProject(event.target.value); setReview(null); setActiveFile(null); setPreview(""); }} className="rounded border p-2 dark:bg-slate-900">
                {live.projects.map(project => <option key={project.project_id} value={project.project_id}>{project.name}</option>)}
            </select>
            <button disabled={busy} onClick={() => void run(refresh)} className="rounded border px-4 py-2">Yenile</button>
        </header>
        {message && <p role="status" className="mb-4 rounded bg-slate-100 p-3 dark:bg-slate-800">{message}</p>}
        <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border p-4">
                <h2 className="mb-3 text-lg font-semibold">Cihazdaki belgeleri içe aktar</h2>
                <input aria-label="Dosya ara" placeholder="Dosya adıyla filtrele" value={filter} onChange={e => setFilter(e.target.value)} className="mb-3 w-full rounded border p-2 dark:bg-slate-900" />
                <div className="max-h-60 overflow-auto">
                    {inbox.filter(file => file.path.toLowerCase().includes(filter.toLowerCase())).map(file => <label key={file.path} className="flex items-start gap-2 py-1 text-sm">
                        <input type="checkbox" disabled={busy || (!selected.includes(file.path) && selected.length >= 100)} checked={selected.includes(file.path)} onChange={e => setSelected(previous => e.target.checked ? [...previous, file.path] : previous.filter(path => path !== file.path))} />
                        <span className="break-all">{file.path}</span>
                    </label>)}
                </div>
                <button className="mt-4 rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50" disabled={busy || !selected.length} onClick={() => void run(async () => {
                    await coairFetch("/local/import", { token, projectId, method: "POST", body: { paths: selected }, timeoutMs: 300000 });
                    setSelected([]); await refresh(); setMessage("Belgeler işleme kuyruğuna alındı. Durumlarını yenileyerek takip edebilirsiniz.");
                })}>Seçilenleri içe aktar ({selected.length})</button>
            </section>
            <section className="rounded-xl border p-4">
                <h2 className="mb-3 text-lg font-semibold">Proje belgeleri</h2>
                <label className="mb-3 block">Bilgisayardan yükle <input aria-label="Belge yükle" type="file" disabled={busy} accept=".pdf,.docx,.txt,.xls,.xlsx,.csv,.eml,.msg" onChange={event => {
                    const file = event.target.files?.[0]; if (!file) return;
                    void run(async () => { const body = new FormData(); body.append("file", file); await coairFetch("/upload", { token, projectId, method: "POST", body, timeoutMs: 300000 }); await refresh(); setMessage("Belge işleme kuyruğuna alındı."); });
                }} /></label>
                <div className="max-h-60 overflow-auto">{files.map(file => <div key={file.id} className="flex items-center justify-between gap-3 border-b py-2 text-sm">
                    <span className="break-all">{file.name} · {file.status}</span>
                    <button className="shrink-0 underline" disabled={busy} onClick={() => void run(() => open(file))}>İncele</button>
                </div>)}</div>
                <p className="mt-3 text-sm text-slate-500">Metin düzenleme PDF, DOCX ve TXT belgeleri için çıkarım tamamlandıktan sonra açılır.</p>
            </section>
        </div>
        {review && activeFile && <section className="mt-6 rounded-xl border p-4">
            <h2 className="mb-4 text-lg font-semibold">{activeFile.name} · Sürüm {review.version}</h2>
            {!!review.extraction?.review_reasons?.length && <p role="status" className="mb-4 rounded bg-amber-50 p-3 text-amber-900">Metadata kontrol gerektiriyor: {review.extraction.review_reasons.join(", ")}. Büyük belgelerde hızlı metadata çıkarımı ilk 24.000 karakteri inceler; tam metin arama indeksi ayrıca oluşturulur.</p>}
            <div className="grid gap-4 lg:grid-cols-2">
                <div>{preview && <iframe title="Orijinal belge" src={preview} className="h-[650px] w-full rounded border" />}</div>
                <div>
                    <div className="grid gap-3 sm:grid-cols-2">{Object.entries(labels).map(([key, label]) => <label key={key} className="text-sm">{label}<textarea rows={key === "summary" ? 4 : 2} className="mt-1 w-full rounded border p-2 dark:bg-slate-900" value={review.metadata[key] || ""} onChange={e => setReview({ ...review, metadata: { ...review.metadata, [key]: e.target.value } })} /></label>)}</div>
                    <label className="my-4 block">Sayfa <select aria-label="Sayfa" className="rounded border p-2 dark:bg-slate-900" value={page} onChange={e => setPage(e.target.value)}>{Object.keys(review.pages).map(number => <option key={number}>{number}</option>)}</select></label>
                    <textarea aria-label="Çıkarılan metin" className="h-80 w-full rounded border p-3 font-mono text-sm dark:bg-slate-900" value={review.pages[page] || ""} onChange={e => setReview({ ...review, pages: { ...review.pages, [page]: e.target.value } })} />
                    <p className="my-3 text-sm text-slate-500">Orijinal dosya korunur. Düzeltmeler yeni sürüm olarak saklanır ve arama/olay indeksi yeniden oluşturulur.</p>
                    <button disabled={busy} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50" onClick={() => void run(async () => {
                        const saved = await coairFetch<Review>(`/local/documents/${activeFile.id}/review`, { token, projectId, method: "PUT", body: review });
                        setReview(saved); setMessage("Düzeltmeler kaydedildi. Yeniden indeksleme kuyruğa alındı.");
                    })}>Kaydet ve yeniden işle</button>
                </div>
            </div>
        </section>}
    </main>;
}
