"use client";

const SETTINGS = [
    {
        title: "General",
        description: "Manage platform identity and regional defaults.",
        fields: [
            { label: "Platform name", value: "COAir" },
            { label: "Timezone", value: "UTC" },
        ],
    },
    {
        title: "Security",
        description: "Review organization-wide access controls.",
        fields: [
            { label: "Session timeout", value: "30 minutes" },
            { label: "Two-factor authentication", value: "Required" },
        ],
    },
    {
        title: "AI Models",
        description: "Configure the default model and token policy.",
        fields: [
            { label: "Default model", value: "COAir Chat" },
            { label: "Monthly token limit", value: "5,000,000" },
        ],
    },
    {
        title: "Storage",
        description: "View the configured document storage provider.",
        fields: [
            { label: "Provider", value: "Amazon S3" },
            { label: "Default region", value: "eu-central-1" },
        ],
    },
    {
        title: "Notifications",
        description: "Set platform alert and digest preferences.",
        fields: [
            { label: "Admin alerts", value: "Enabled" },
            { label: "Usage digest", value: "Weekly" },
        ],
    },
] as const;

const SettingsPage = () => {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-label-xl text-strong-950">Settings</h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    Preview platform configuration. To change your admin password,
                    open Settings from your profile avatar in the sidebar or
                    header.
                </p>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                {SETTINGS.map((section) => (
                    <section
                        key={section.title}
                        className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5"
                    >
                        <h2 className="text-label-lg text-strong-950">
                            {section.title}
                        </h2>
                        <p className="mt-1 text-label-xs text-sub-600">
                            {section.description}
                        </p>

                        <div className="mt-5 space-y-4">
                            {section.fields.map((field) => (
                                <label
                                    key={field.label}
                                    className="block text-label-xs text-sub-600"
                                >
                                    {field.label}
                                    <input
                                        type="text"
                                        value={field.value}
                                        disabled
                                        className="mt-2 h-10 w-full rounded-xl border border-stroke-soft-200 bg-weak-50 px-3 text-label-sm text-sub-600 disabled:cursor-not-allowed disabled:opacity-70"
                                    />
                                </label>
                            ))}
                        </div>

                        <button
                            type="button"
                            disabled
                            className="mt-5 h-10 rounded-xl bg-blue-500 px-4 text-label-sm text-white-0 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Save
                        </button>
                    </section>
                ))}
            </div>
        </div>
    );
};

export default SettingsPage;
