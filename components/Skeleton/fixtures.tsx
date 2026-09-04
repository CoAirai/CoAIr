/** Static layout mocks for `npx boneyard-js build` capture (no auth required). */

export function AdminContentFixture() {
    return (
        <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {["Companies", "Users", "Revenue", "Tickets"].map((label) => (
                    <section
                        key={label}
                        className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5"
                    >
                        <p className="text-label-sm text-sub-600">{label}</p>
                        <p className="mt-3 text-title-h5 text-strong-950">128</p>
                        <p className="mt-1 text-paragraph-sm text-sub-600">
                            vs last week
                        </p>
                    </section>
                ))}
            </div>
            <section className="rounded-3xl border border-stroke-soft-200 bg-white-0 p-6">
                <h2 className="text-label-lg text-strong-950">Platform activity</h2>
                <p className="mt-2 text-paragraph-sm text-sub-600">
                    Sign-ins, invites, and billing events across tenants.
                </p>
                <div className="mt-6 h-48 rounded-2xl bg-weak-50" />
            </section>
            <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-3xl border border-stroke-soft-200 bg-white-0 p-6">
                    <h3 className="text-label-md text-strong-950">Recent companies</h3>
                    <ul className="mt-4 space-y-3">
                        {["Acme Builders", "Northline GC", "Summit Civil"].map(
                            (name) => (
                                <li
                                    key={name}
                                    className="rounded-xl bg-weak-50 px-4 py-3 text-paragraph-sm text-strong-950"
                                >
                                    {name}
                                </li>
                            )
                        )}
                    </ul>
                </section>
                <section className="rounded-3xl border border-stroke-soft-200 bg-white-0 p-6">
                    <h3 className="text-label-md text-strong-950">Open requests</h3>
                    <ul className="mt-4 space-y-3">
                        {["Seat upgrade", "Domain verify", "Invoice copy"].map(
                            (name) => (
                                <li
                                    key={name}
                                    className="rounded-xl bg-weak-50 px-4 py-3 text-paragraph-sm text-strong-950"
                                >
                                    {name}
                                </li>
                            )
                        )}
                    </ul>
                </section>
            </div>
        </div>
    );
}

export function CompanyContentFixture() {
    return (
        <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {["Members", "Projects", "Usage"].map((label) => (
                    <section
                        key={label}
                        className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5"
                    >
                        <p className="text-label-sm text-sub-600">{label}</p>
                        <p className="mt-3 text-title-h5 text-strong-950">24</p>
                    </section>
                ))}
            </div>
            <section className="flex items-center justify-between rounded-2xl border border-stroke-soft-200 bg-white-0 px-5 py-4">
                <p className="text-label-md text-strong-950">Workspace plan</p>
                <p className="text-paragraph-sm text-sub-600">Professional</p>
            </section>
            <section className="rounded-3xl border border-stroke-soft-200 bg-white-0 p-6">
                <h2 className="text-label-lg text-strong-950">Team directory</h2>
                <div className="mt-4 space-y-3">
                    {["Alex Rivera", "Jordan Lee", "Sam Patel"].map((name) => (
                        <div
                            key={name}
                            className="rounded-xl bg-weak-50 px-4 py-4 text-paragraph-sm text-strong-950"
                        >
                            {name}
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}

function FixtureSidebar({
    title,
    items,
}: {
    title: string;
    items: string[];
}) {
    return (
        <aside className="fixed top-5 bottom-5 left-5 z-20 flex w-80 flex-col rounded-3xl bg-white-0 p-3 shadow-[0_0_1.25rem_0_rgba(0,0,0,0.03)] max-3xl:w-65 max-lg:hidden">
            <div className="mb-5 flex items-center gap-2 px-2">
                <div className="rounded-xl bg-weak-50 px-3 py-2 text-label-md text-strong-950">
                    COAir
                </div>
                <span className="text-paragraph-sm text-sub-600">{title}</span>
            </div>
            <nav className="flex flex-col gap-2">
                {items.map((item) => (
                    <div
                        key={item}
                        className="rounded-xl px-3 py-2.5 text-label-sm text-strong-950 hover:bg-weak-50"
                    >
                        {item}
                    </div>
                ))}
            </nav>
            <div className="mt-auto rounded-2xl bg-weak-50 p-4 text-paragraph-sm text-sub-600">
                Account menu
            </div>
        </aside>
    );
}

export function AdminPortalFixture() {
    return (
        <div className="h-screen overflow-hidden bg-weak-50 pr-5 pl-90 max-3xl:pl-75 max-lg:pl-5 max-md:px-4">
            <FixtureSidebar
                title="Admin"
                items={[
                    "Dashboard",
                    "Companies",
                    "Users",
                    "Billing",
                    "Security",
                    "Email",
                    "Audit",
                    "Settings",
                    "Support",
                ]}
            />
            <div className="flex h-full flex-col pt-9.5 pb-5 max-2xl:pt-5 max-md:pt-3 max-md:pb-4">
                <div className="mb-3.5 flex shrink-0 items-center gap-4">
                    <h1 className="text-title-h6 text-strong-950">Dashboard</h1>
                    <div className="ml-auto size-10 rounded-xl bg-white-0" />
                </div>
                <div className="min-h-0 grow overflow-auto">
                    <AdminContentFixture />
                </div>
            </div>
        </div>
    );
}

export function CompanyPortalFixture() {
    return (
        <div className="h-screen overflow-hidden bg-weak-50 pr-5 pl-90 max-3xl:pl-75 max-lg:pl-5 max-md:px-4">
            <FixtureSidebar
                title="Company"
                items={[
                    "Overview",
                    "Members",
                    "Billing",
                    "Projects",
                    "Integrations",
                    "Settings",
                ]}
            />
            <div className="flex h-full flex-col pt-9.5 pb-5 max-2xl:pt-5 max-md:pt-3 max-md:pb-4">
                <div className="mb-3.5 flex shrink-0 items-center gap-4">
                    <h1 className="text-title-h6 text-strong-950">Overview</h1>
                    <div className="ml-auto size-10 rounded-xl bg-white-0" />
                </div>
                <div className="min-h-0 grow overflow-auto">
                    <CompanyContentFixture />
                </div>
            </div>
        </div>
    );
}

export function WorkspaceHubFixture() {
    return (
        <div className="min-h-screen bg-weak-50 text-strong-950">
            <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
                <div className="min-w-40">
                    <p className="text-paragraph-xs text-sub-600">Workspace</p>
                    <p className="text-label-md text-strong-950">Acme Builders</p>
                </div>
                <div className="rounded-xl bg-white-0 px-4 py-2 text-label-sm text-strong-950">
                    COAir
                </div>
                <div className="flex min-w-40 items-center justify-end gap-3">
                    <span className="hidden text-paragraph-xs text-sub-600 sm:block">
                        Account
                    </span>
                    <div className="size-10 rounded-xl bg-white-0" />
                </div>
            </header>
            <main className="mx-auto max-w-6xl px-6 pb-16 pt-10 text-center">
                <p className="text-paragraph-xs uppercase tracking-wide text-sub-600">
                    Modules
                </p>
                <h1 className="mt-4 text-title-h4 text-strong-950">
                    Choose a workspace module
                </h1>
                <p className="mx-auto mt-3 max-w-xl text-paragraph-sm text-sub-600">
                    Open chat, chronology, or forensic tools for this project.
                </p>
                <div className="mx-auto mt-5 inline-flex rounded-full bg-white-0 px-4 py-2 text-label-sm text-strong-950">
                    Professional plan
                </div>
                <div className="mt-12 grid gap-5 text-left md:grid-cols-3">
                    {["Chat", "Chronology", "Forensic"].map((name) => (
                        <section
                            key={name}
                            className="min-h-[22rem] rounded-[1.75rem] border border-stroke-soft-200 bg-white-0 p-6"
                        >
                            <h2 className="text-title-h6 text-strong-950">{name}</h2>
                            <p className="mt-3 text-paragraph-sm text-sub-600">
                                Module description and access status for {name}.
                            </p>
                            <div className="mt-8 h-40 rounded-2xl bg-weak-50" />
                            <p className="mt-6 text-label-sm text-blue-500">Open module</p>
                        </section>
                    ))}
                </div>
            </main>
        </div>
    );
}

export function ChatPortalFixture() {
    return (
        <div className="overflow-hidden bg-weak-50 pl-90 pr-5 max-3xl:pl-75 max-lg:pl-5 max-md:px-4">
            <aside className="fixed top-5 bottom-5 left-5 z-20 flex w-80 flex-col rounded-3xl bg-white-0 p-3 shadow-[0_0_1.25rem_0_rgba(0,0,0,0.03)] max-3xl:w-65 max-lg:hidden">
                <div className="mb-5 flex items-center gap-2 px-2">
                    <div className="size-8 rounded-xl bg-weak-50" />
                    <span className="text-label-md text-strong-950">Chat</span>
                </div>
                <div className="mb-4 rounded-xl bg-weak-50 px-3 py-2.5 text-label-sm text-sub-600">
                    New conversation
                </div>
                <p className="mb-3 px-2 text-paragraph-xs text-sub-600">Recent</p>
                <div className="flex flex-col gap-2">
                    {[
                        "RFI summary",
                        "Schedule delay",
                        "Submittal check",
                        "Change order",
                        "Site photo log",
                        "Safety notes",
                    ].map((item) => (
                        <div
                            key={item}
                            className="rounded-xl px-3 py-2 text-label-sm text-strong-950"
                        >
                            {item}
                        </div>
                    ))}
                </div>
                <div className="mt-auto space-y-3 pt-4">
                    <div className="rounded-2xl bg-weak-50 p-4 text-paragraph-sm text-sub-600">
                        Project context
                    </div>
                    <div className="rounded-2xl bg-weak-50 p-3 text-paragraph-sm text-sub-600">
                        Settings
                    </div>
                </div>
            </aside>
            <div className="pt-9.5 pb-5 max-2xl:pt-5 max-md:pt-3 max-md:pb-4">
                <div className="mb-4 flex items-center gap-3">
                    <h1 className="text-title-h6 text-strong-950">Project chat</h1>
                    <div className="ml-auto size-10 rounded-xl bg-white-0" />
                </div>
                <div className="flex min-h-[calc(100svh-8rem)] flex-col rounded-[1.25rem] bg-white-0 p-6 max-md:p-4">
                    <div className="mx-auto mb-10 w-full max-w-md space-y-3 text-center">
                        <div className="mx-auto h-16 w-40 rounded-xl bg-weak-50" />
                        <h2 className="text-title-h6 text-strong-950">Ask COAir</h2>
                        <p className="text-paragraph-sm text-sub-600">
                            Cite drawings, RFIs, and schedules with sources.
                        </p>
                    </div>
                    <div className="mt-auto space-y-3">
                        <div className="w-3/5 rounded-2xl bg-weak-50 px-4 py-3 text-paragraph-sm text-strong-950">
                            What delayed the foundation pour?
                        </div>
                        <div className="ml-auto w-2/5 rounded-2xl bg-blue-50 px-4 py-3 text-paragraph-sm text-strong-950">
                            Checking chronology…
                        </div>
                        <div className="w-2/3 rounded-2xl bg-weak-50 px-4 py-4 text-paragraph-sm text-strong-950">
                            Weather hold on 12 Mar plus rebar inspection lag.
                        </div>
                        <div className="rounded-2xl border border-stroke-soft-200 px-4 py-3 text-paragraph-sm text-sub-600">
                            Message COAir…
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ModulePortalFixture() {
    return (
        <div className="min-h-screen bg-weak-50 px-6 py-10">
            <div className="mx-auto max-w-3xl rounded-2xl border border-stroke-soft-200 bg-white-0 p-6">
                <p className="text-label-sm text-blue-500">Back to workspace</p>
                <p className="mt-5 text-paragraph-xs uppercase tracking-wide text-sub-600">
                    Module
                </p>
                <h1 className="mt-2 text-title-h5 text-strong-950">Chronology</h1>
                <p className="mt-3 text-paragraph-sm text-sub-600">
                    Build a delay narrative from project documents and events.
                </p>
                <p className="mt-2 text-paragraph-sm text-sub-600">
                    Connect a project to unlock analysis tools.
                </p>
                <button
                    type="button"
                    className="mt-6 rounded-xl bg-strong-950 px-5 py-2.5 text-label-sm text-white-0"
                >
                    Open module
                </button>
            </div>
        </div>
    );
}

export function CompanyTeamTableFixture() {
    const rows = [
        ["Ahmad", "ahmad@example.com", "Owner", "12,400", "50,000", "37,600"],
        ["Jordan Lee", "jordan@example.com", "Member", "4,200", "10,000", "5,800"],
        ["Sam Patel", "sam@example.com", "Member", "1,100", "10,000", "8,900"],
        ["Alex Rivera", "alex@example.com", "Member", "8,050", "10,000", "1,950"],
        ["Casey Kim", "casey@example.com", "Member", "0", "5,000", "5,000"],
    ];
    return (
        <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[1280px] text-left">
                    <thead className="bg-weak-50 text-label-xs text-sub-600">
                        <tr>
                            {[
                                "Name",
                                "Username",
                                "Role",
                                "Used",
                                "Limit",
                                "Remaining",
                                "Projects",
                                "Chronology",
                                "Forensic",
                                "Upload",
                                "Download",
                                "Reports",
                                "Status",
                                "Projects",
                                "Actions",
                            ].map((label) => (
                                <th key={label} className="px-5 py-3 font-medium">
                                    {label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stroke-soft-200">
                        {rows.map((row) => (
                            <tr key={row[1]} className="text-label-sm">
                                <td className="px-5 py-4 text-strong-950">
                                    {row[0]}
                                </td>
                                <td className="px-5 py-4 text-sub-600">{row[1]}</td>
                                <td className="px-5 py-4 text-strong-950">
                                    {row[2]}
                                </td>
                                <td className="px-5 py-4 tabular-nums text-sub-600">
                                    {row[3]}
                                </td>
                                <td className="px-5 py-4 tabular-nums text-sub-600">
                                    {row[4]}
                                </td>
                                <td className="px-5 py-4 tabular-nums text-sub-600">
                                    {row[5]}
                                </td>
                                {Array.from({ length: 6 }).map((_, index) => (
                                    <td
                                        key={index}
                                        className="px-5 py-4 text-center text-sub-600"
                                    >
                                        On
                                    </td>
                                ))}
                                <td className="px-5 py-4 text-strong-950">Active</td>
                                <td className="px-5 py-4 text-sub-600">2</td>
                                <td className="px-5 py-4 text-sub-600">—</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
