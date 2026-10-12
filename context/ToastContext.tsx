"use client";

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

export type ToastTone = "info" | "success" | "error";

type ToastItem = {
    id: string;
    message: string;
    tone: ToastTone;
};

type ToastValue = {
    pushToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<ToastItem[]>([]);

    const pushToast = useCallback((message: string, tone: ToastTone = "info") => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setItems((prev) => [...prev.slice(-4), { id, message, tone }]);
        window.setTimeout(() => {
            setItems((prev) => prev.filter((item) => item.id !== id));
        }, 4200);
    }, []);

    const dismissToast = useCallback((id: string) => {
        setItems((prev) => prev.filter((item) => item.id !== id));
    }, []);

    const value = useMemo(() => ({ pushToast }), [pushToast]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div
                className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 max-md:bottom-24"
                aria-live="polite"
            >
                <AnimatePresence initial={false}>
                    {items.map((item) => (
                        <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 12, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.98 }}
                            transition={{ duration: 0.2 }}
                            role={item.tone === "error" ? "alert" : "status"}
                            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-label-sm shadow-lg ${
                                item.tone === "success"
                                    ? "border-green-500/20 bg-white-0 text-strong-950"
                                    : item.tone === "error"
                                      ? "border-red-500/20 bg-white-0 text-strong-950"
                                      : "border-stroke-soft-200 bg-white-0 text-strong-950"
                            }`}
                        >
                            <span className="min-w-0 grow">{item.message}</span>
                            <button
                                type="button"
                                className="shrink-0 text-label-xs text-sub-600"
                                aria-label="Dismiss"
                                onClick={() => dismissToast(item.id)}
                            >
                                Close
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        return {
            pushToast: (_message: string, _tone?: ToastTone) => undefined,
        };
    }
    return ctx;
}
