import Bone from "./Bone";

export function AdminContentSkeleton() {
    return (
        <div className="space-y-4" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading</span>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                    <Bone key={index} className="h-28 w-full rounded-2xl" />
                ))}
            </div>
            <Bone className="h-72 w-full rounded-3xl" />
            <div className="grid gap-4 lg:grid-cols-2">
                <Bone className="h-56 w-full rounded-3xl" />
                <Bone className="h-56 w-full rounded-3xl" />
            </div>
        </div>
    );
}

export function CompanyContentSkeleton() {
    return (
        <div className="space-y-4" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading</span>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                    <Bone key={index} className="h-28 w-full rounded-2xl" />
                ))}
            </div>
            <Bone className="h-16 w-full rounded-2xl" />
            <Bone className="h-80 w-full rounded-3xl" />
        </div>
    );
}

function ShellSidebar({ lines = 8 }: { lines?: number }) {
    return (
        <aside className="fixed top-5 bottom-5 left-5 z-20 flex w-80 flex-col rounded-3xl bg-white-0 p-3 shadow-[0_0_1.25rem_0_rgba(0,0,0,0.03)] max-3xl:w-65 max-lg:hidden">
            <div className="mb-5 flex items-center gap-2">
                <Bone className="h-9 w-28 rounded-xl" />
                <Bone className="h-4 w-24" />
            </div>
            <div className="flex flex-col gap-2">
                {Array.from({ length: lines }).map((_, index) => (
                    <Bone key={index} className="h-10 w-full" />
                ))}
            </div>
            <div className="mt-auto pt-4">
                <Bone className="h-14 w-full rounded-2xl" />
            </div>
        </aside>
    );
}

export function AdminPortalSkeleton() {
    return (
        <div className="h-screen overflow-hidden bg-weak-50 pr-5 pl-90 max-3xl:pl-75 max-lg:pl-5 max-md:px-4">
            <ShellSidebar lines={9} />
            <div className="flex h-full flex-col pt-9.5 pb-5 max-2xl:pt-5 max-md:pt-3 max-md:pb-4">
                <div className="mb-3.5 flex shrink-0 items-center gap-4">
                    <Bone className="h-6 w-48" />
                    <Bone className="ml-auto size-10 rounded-xl" />
                </div>
                <div className="min-h-0 grow overflow-hidden">
                    <AdminContentSkeleton />
                </div>
            </div>
        </div>
    );
}

export function CompanyPortalSkeleton() {
    return (
        <div className="h-screen overflow-hidden bg-weak-50 pr-5 pl-90 max-3xl:pl-75 max-lg:pl-5 max-md:px-4">
            <ShellSidebar lines={6} />
            <div className="flex h-full flex-col pt-9.5 pb-5 max-2xl:pt-5 max-md:pt-3 max-md:pb-4">
                <div className="mb-3.5 flex shrink-0 items-center gap-4">
                    <Bone className="h-6 w-44" />
                    <Bone className="ml-auto size-10 rounded-xl" />
                </div>
                <div className="min-h-0 grow overflow-hidden">
                    <CompanyContentSkeleton />
                </div>
            </div>
        </div>
    );
}

export function WorkspaceHubSkeleton() {
    return (
        <div className="min-h-screen bg-weak-50 text-strong-950" aria-busy="true">
            <span className="sr-only">Loading workspace</span>
            <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
                <div className="min-w-40 space-y-2">
                    <Bone className="h-3 w-24" />
                    <Bone className="h-4 w-36" />
                </div>
                <Bone className="h-8 w-24 rounded-xl" />
                <div className="flex min-w-40 items-center justify-end gap-3">
                    <Bone className="hidden h-3 w-16 sm:block" />
                    <Bone className="size-10 rounded-xl" />
                </div>
            </header>
            <main className="mx-auto max-w-6xl px-6 pb-16 pt-10">
                <Bone className="mx-auto h-3 w-28" />
                <Bone className="mx-auto mt-4 h-10 w-80 max-w-full" />
                <Bone className="mx-auto mt-3 h-4 w-[28rem] max-w-full" />
                <Bone className="mx-auto mt-5 h-7 w-48 rounded-full" />
                <div className="mt-12 grid gap-5 md:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <Bone
                            key={index}
                            className="min-h-[22rem] w-full rounded-[1.75rem]"
                        />
                    ))}
                </div>
            </main>
        </div>
    );
}

export function ChatPortalSkeleton() {
    return (
        <div
            className="overflow-hidden bg-weak-50 pl-90 pr-5 max-3xl:pl-75 max-lg:pl-5 max-md:px-4"
            aria-busy="true"
        >
            <span className="sr-only">Loading chat</span>
            <aside className="fixed top-5 bottom-5 left-5 z-20 flex w-80 flex-col rounded-3xl bg-white-0 p-3 shadow-[0_0_1.25rem_0_rgba(0,0,0,0.03)] max-3xl:w-65 max-lg:hidden">
                <div className="mb-5 flex items-center gap-2">
                    <Bone className="size-8 rounded-xl" />
                    <Bone className="h-5 w-24" />
                </div>
                <Bone className="mb-4 h-10 w-full" />
                <Bone className="mb-3 h-4 w-28" />
                <div className="flex flex-col gap-2">
                    {Array.from({ length: 6 }).map((_, index) => (
                        <Bone key={index} className="h-9 w-full" />
                    ))}
                </div>
                <div className="mt-auto space-y-3 pt-4">
                    <Bone className="h-16 w-full rounded-2xl" />
                    <Bone className="h-12 w-full rounded-2xl" />
                </div>
            </aside>
            <div className="pt-9.5 pb-5 max-2xl:pt-5 max-md:pt-3 max-md:pb-4">
                <div className="mb-4 flex items-center gap-3">
                    <Bone className="h-10 w-10 rounded-xl max-lg:block hidden" />
                    <Bone className="h-10 w-52" />
                    <Bone className="ml-auto size-10 rounded-xl" />
                </div>
                <div className="flex min-h-[calc(100svh-8rem)] flex-col rounded-[1.25rem] bg-white-0 p-6 max-md:p-4">
                    <div className="mx-auto mb-10 w-full max-w-md space-y-3 text-center">
                        <Bone className="mx-auto h-16 w-40 rounded-xl" />
                        <Bone className="mx-auto h-6 w-48" />
                        <Bone className="mx-auto h-4 w-72 max-w-full" />
                    </div>
                    <div className="mt-auto space-y-3">
                        <Bone className="h-16 w-3/5 rounded-2xl" />
                        <Bone className="ml-auto h-14 w-2/5 rounded-2xl" />
                        <Bone className="h-20 w-2/3 rounded-2xl" />
                        <Bone className="h-14 w-full rounded-2xl" />
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ModulePortalSkeleton() {
    return (
        <div className="min-h-screen bg-weak-50 px-6 py-10" aria-busy="true">
            <span className="sr-only">Loading module</span>
            <div className="mx-auto max-w-3xl rounded-2xl border border-stroke-soft-200 bg-white-0 p-6">
                <Bone className="h-4 w-28" />
                <Bone className="mt-5 h-3 w-20" />
                <Bone className="mt-2 h-7 w-56" />
                <Bone className="mt-3 h-4 w-full" />
                <Bone className="mt-2 h-4 w-4/5" />
                <Bone className="mt-6 h-11 w-36" />
            </div>
        </div>
    );
}
