"use client";

import { FormEvent, useEffect, useState } from "react";

import { useCompanyData } from "@/context/CompanyDataContext";

const SettingsPage = () => {
    const { company, updateCompanyProfile } = useCompanyData();

    const [name, setName] = useState(company.name);
    const [industry, setIndustry] = useState(company.industry);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        setName(company.name);
        setIndustry(company.industry);
    }, [company.name, company.industry]);

    const canSave = name.trim().length > 0 && industry.trim().length > 0;

    const onSubmit = (event: FormEvent) => {
        event.preventDefault();
        if (!canSave) return;

        updateCompanyProfile({ name: name.trim(), industry: industry.trim() });
        setSuccess("Company profile updated");
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Settings</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Manage your company profile.
                </p>
            </div>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                <h2 className="text-label-lg text-strong-950">
                    Company profile
                </h2>
                <p className="mt-1 text-label-xs text-sub-600">
                    Display name and industry shown across the company admin.
                </p>

                <form
                    onSubmit={onSubmit}
                    className="mt-4 max-w-md space-y-3"
                >
                    <label className="block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Company name
                        </span>
                        <input
                            required
                            type="text"
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value);
                                setSuccess(null);
                            }}
                            placeholder="Company name"
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none placeholder:text-sub-600 focus:border-blue-500"
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-label-xs text-sub-600">
                            Industry
                        </span>
                        <input
                            required
                            type="text"
                            value={industry}
                            onChange={(e) => {
                                setIndustry(e.target.value);
                                setSuccess(null);
                            }}
                            placeholder="Industry"
                            className="h-10 w-full rounded-xl border border-stroke-soft-200 px-3 text-label-sm outline-none placeholder:text-sub-600 focus:border-blue-500"
                        />
                    </label>

                    {success && (
                        <p className="text-label-sm text-green-600">
                            {success}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={!canSave}
                        className="h-10 rounded-full bg-blue-500 px-4 text-label-sm text-white-0 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Save changes
                    </button>
                </form>
            </section>

            <section className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
                <h2 className="text-label-lg text-strong-950">
                    Password
                </h2>
                <p className="mt-1 text-label-xs text-sub-600">
                    Change your password from the profile menu in the sidebar
                    or header (click your avatar → Security).
                </p>
            </section>
        </div>
    );
};

export default SettingsPage;
