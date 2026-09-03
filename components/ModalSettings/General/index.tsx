"use client";

import { FormEvent, useEffect, useState } from "react";
import Field from "@/components/Field";
import Button from "@/components/Button";
import UploadImage from "./UploadImage";
import { useAuth } from "@/context/AuthContext";
import { useCompanyDataOptional } from "@/context/CompanyDataContext";
import { updateMyProfile } from "@/lib/coair/org";
import {
    readPhoneLocal,
    writeAvatarPreview,
    writePhoneLocal,
} from "@/lib/settings/localPrefs";

const General = () => {
    const { session, updateSession } = useAuth();
    const companyData = useCompanyDataOptional();
    const isCompanyAdmin = session?.role === "company_admin";

    const [fullName, setFullName] = useState(session?.name ?? "");
    const [email, setEmail] = useState(session?.email ?? "");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [companyName, setCompanyName] = useState(
        companyData?.company.name ?? ""
    );
    const [industry, setIndustry] = useState(
        companyData?.company.industry ?? ""
    );
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setFullName(session?.name ?? "");
        setEmail(session?.email ?? "");
        setPhoneNumber(readPhoneLocal());
    }, [session?.name, session?.email]);

    useEffect(() => {
        if (!companyData?.company) return;
        setCompanyName(companyData.company.name);
        setIndustry(companyData.company.industry);
    }, [
        companyData?.company.name,
        companyData?.company.industry,
        companyData?.company,
    ]);

    const onDiscard = () => {
        setFullName(session?.name ?? "");
        setEmail(session?.email ?? "");
        setPhoneNumber(readPhoneLocal());
        if (companyData) {
            setCompanyName(companyData.company.name);
            setIndustry(companyData.company.industry);
        }
        setMessage(null);
        setError(null);
    };

    const onSave = async (event: FormEvent) => {
        event.preventDefault();
        const name = fullName.trim();
        if (!name) {
            setError("Full name is required");
            setMessage(null);
            return;
        }

        setSaving(true);
        setError(null);
        setMessage(null);

        try {
            writePhoneLocal(phoneNumber.trim());
            updateSession({ name });

            if (isCompanyAdmin && companyData) {
                const nextCompany = companyName.trim();
                const nextIndustry = industry.trim();
                if (!nextCompany || !nextIndustry) {
                    setError("Company name and industry are required");
                    setSaving(false);
                    return;
                }
                companyData.updateCompanyProfile({
                    name: nextCompany,
                    industry: nextIndustry,
                });
            }

            const token = session?.accessToken;
            if (token && session?.source === "live") {
                await updateMyProfile(token, {
                    display_name: name,
                    phone: phoneNumber.trim(),
                });
            }

            setMessage("Settings saved.");
        } catch {
            setError("Could not save profile. Changes kept on this device.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <form className="-mt-5 max-md:mt-0" onSubmit={onSave}>
            <div className="flex items-center mb-3 pb-3 border-b border-stroke-soft-200 max-md:flex-col max-md:items-start max-md:gap-3">
                <div className="mr-auto">
                    <div className="text-label-md">Avatar</div>
                    <div className="text-sub-600">Shown in your account menu</div>
                </div>
                <UploadImage
                    onChange={(dataUrl) => writeAvatarPreview(dataUrl)}
                />
            </div>
            <div className="mb-3 pb-3 border-b border-stroke-soft-200">
                <div className="mb-3">
                    <div className="text-label-md">Personal Information</div>
                    <div className="text-sub-600">
                        Edit your personal information
                    </div>
                </div>
                <Field
                    className="mb-3"
                    label="Full name"
                    placeholder="Enter full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    isSmall
                />
                <Field
                    className="mb-1"
                    label="Email"
                    placeholder="Enter email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    isSmall
                    disabled
                />
                <p className="mt-1 text-label-xs text-sub-600">
                    Email is tied to your login and cannot be changed here.
                </p>
            </div>
            <div className="mb-3 pb-3 border-b border-stroke-soft-200">
                <div className="mb-3">
                    <div className="text-label-md">Phone number</div>
                    <div className="text-sub-600">Update your phone number</div>
                </div>
                <Field
                    className=""
                    label="Phone number"
                    placeholder="Enter phone number"
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    isSmall
                />
            </div>
            {isCompanyAdmin && companyData ? (
                <div className="mb-3 pb-3 border-b border-stroke-soft-200">
                    <div className="mb-3">
                        <div className="text-label-md">Company profile</div>
                        <div className="text-sub-600">
                            Display name and industry for your organization
                        </div>
                    </div>
                    <Field
                        className="mb-3"
                        label="Company name"
                        placeholder="Company name"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        required
                        isSmall
                    />
                    <Field
                        className=""
                        label="Industry"
                        placeholder="Industry"
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value)}
                        required
                        isSmall
                    />
                </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-3">
                {error ? (
                    <p className="mr-auto text-label-sm text-red-500">{error}</p>
                ) : null}
                {message ? (
                    <p className="mr-auto text-label-sm text-green-600">
                        {message}
                    </p>
                ) : null}
                <Button
                    type="button"
                    className="!h-10 !px-4.5 !bg-weak-50"
                    isStroke
                    onClick={onDiscard}
                >
                    Discard
                </Button>
                <Button
                    type="submit"
                    className="!h-10 !px-4.5"
                    isBlack
                    disabled={saving}
                >
                    {saving ? "Saving…" : "Save Changes"}
                </Button>
            </div>
        </form>
    );
};

export default General;
