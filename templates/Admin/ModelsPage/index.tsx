"use client";

import { FormEvent, useEffect, useState } from "react";

import Switch from "@/components/Switch";
import { useAdminData } from "@/context/AdminDataContext";
import type { AiModelId } from "@/lib/admin/wave2Types";

type ModelDraft = {
    enabled: boolean;
    requestsPerMinute: string;
    dailyTokenCap: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");

const ModelsPage = () => {
    const { models, updateModel } = useAdminData();
    const [drafts, setDrafts] = useState<Partial<Record<AiModelId, ModelDraft>>>(
        {}
    );
    const [savedId, setSavedId] = useState<AiModelId | null>(null);

    useEffect(() => {
        setDrafts(
            Object.fromEntries(
                models.map((model) => [
                    model.id,
                    {
                        enabled: model.enabled,
                        requestsPerMinute: String(model.requestsPerMinute),
                        dailyTokenCap: String(model.dailyTokenCap),
                    },
                ])
            )
        );
    }, [models]);

    const updateDraft = (
        modelId: AiModelId,
        patch: Partial<ModelDraft>
    ) => {
        setDrafts((prev) => ({
            ...prev,
            [modelId]: { ...prev[modelId]!, ...patch },
        }));
        setSavedId(null);
    };

    const onSave =
        (modelId: AiModelId) => (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const draft = drafts[modelId];
            if (!draft) return;

            const requestsPerMinute = Number(draft.requestsPerMinute);
            const dailyTokenCap = Number(draft.dailyTokenCap);
            if (
                !Number.isFinite(requestsPerMinute) ||
                requestsPerMinute < 0 ||
                !Number.isFinite(dailyTokenCap) ||
                dailyTokenCap < 0
            ) {
                return;
            }

            updateModel(modelId, {
                enabled: draft.enabled,
                requestsPerMinute,
                dailyTokenCap,
            });
            setSavedId(modelId);
        };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Models</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Enable AI models and configure rate limits for the platform.
                </p>
            </div>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
                <div className="border-b border-stroke-soft-200 p-5">
                    <h2 className="text-label-lg text-strong-950">
                        Model configuration
                    </h2>
                    <p className="mt-1 text-label-xs text-sub-600">
                        Three COAIR models: chat, embeddings, and analysis.
                    </p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left">
                        <thead className="bg-weak-50 text-label-xs text-sub-600">
                            <tr>
                                <th className="px-5 py-3 font-medium">Model</th>
                                <th className="px-5 py-3 font-medium">Enabled</th>
                                <th className="px-5 py-3 font-medium">RPM</th>
                                <th className="px-5 py-3 font-medium">
                                    Daily token cap
                                </th>
                                <th className="px-5 py-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke-soft-200">
                            {models.map((model) => {
                                const draft = drafts[model.id];
                                if (!draft) return null;

                                return (
                                    <tr key={model.id} className="text-label-sm">
                                        <td className="px-5 py-4">
                                            <p className="text-strong-950">
                                                {model.name}
                                            </p>
                                            <p className="mt-0.5 text-label-xs text-sub-600">
                                                Current cap:{" "}
                                                {numberFormatter.format(
                                                    model.dailyTokenCap
                                                )}{" "}
                                                tokens/day
                                            </p>
                                        </td>
                                        <td className="px-5 py-4">
                                            <Switch
                                                checked={draft.enabled}
                                                onChange={(enabled) =>
                                                    updateDraft(model.id, {
                                                        enabled,
                                                    })
                                                }
                                            />
                                        </td>
                                        <td className="px-5 py-4">
                                            <input
                                                type="number"
                                                min={0}
                                                value={draft.requestsPerMinute}
                                                onChange={(event) =>
                                                    updateDraft(model.id, {
                                                        requestsPerMinute:
                                                            event.target.value,
                                                    })
                                                }
                                                className="h-10 w-28 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                                            />
                                        </td>
                                        <td className="px-5 py-4">
                                            <input
                                                type="number"
                                                min={0}
                                                step={1000}
                                                value={draft.dailyTokenCap}
                                                onChange={(event) =>
                                                    updateDraft(model.id, {
                                                        dailyTokenCap:
                                                            event.target.value,
                                                    })
                                                }
                                                className="h-10 w-36 rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none focus:border-blue-500"
                                            />
                                        </td>
                                        <td className="px-5 py-4">
                                            <form onSubmit={onSave(model.id)}>
                                                <div className="flex items-center gap-3">
                                                    <button
                                                        type="submit"
                                                        className="h-9 rounded-full bg-strong-950 px-4 text-label-sm text-white-0 hover:opacity-90"
                                                    >
                                                        Save
                                                    </button>
                                                    {savedId === model.id && (
                                                        <span className="text-label-xs text-green-600">
                                                            Saved
                                                        </span>
                                                    )}
                                                </div>
                                            </form>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="border-t border-stroke-soft-200 px-5 py-3 text-label-xs text-sub-600">
                    {models.length} models configured
                </div>
            </section>
        </div>
    );
};

export default ModelsPage;
