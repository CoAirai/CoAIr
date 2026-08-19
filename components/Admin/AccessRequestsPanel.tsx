"use client";

import type { AccessRequest } from "@/lib/admin/accessRequests";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
});

type Props = {
    pending: AccessRequest[];
    error?: string | null;
    message?: string | null;
    readOnly?: boolean;
    onApprove: (requestId: string) => void;
    onDeny: (requestId: string) => void;
};

const AccessRequestsPanel = ({
    pending,
    error,
    message,
    readOnly = false,
    onApprove,
    onDeny,
}: Props) => (
    <section className="rounded-2xl border border-stroke-soft-200 bg-white-0">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stroke-soft-200 p-5">
            <div>
                <h2 className="text-label-lg text-strong-950">
                    Access requests
                </h2>
                <p className="mt-1 text-label-xs text-sub-600">
                    From Sign up → Request access. Approve so the owner can sign
                    in, choose a package, and complete dummy payment.
                </p>
            </div>
            <span className="rounded-full bg-orange-500/10 px-2.5 py-1 text-label-xs text-orange-600">
                {pending.length} pending
            </span>
        </div>
        {error ? (
            <p className="px-5 pt-4 text-label-sm text-red-500">{error}</p>
        ) : null}
        {message ? (
            <p className="px-5 pt-4 text-label-sm text-green-600">{message}</p>
        ) : null}
        <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left">
                <thead className="bg-weak-50 text-label-xs text-sub-600">
                    <tr>
                        <th className="px-5 py-3 font-medium">Name</th>
                        <th className="px-5 py-3 font-medium">Email</th>
                        <th className="px-5 py-3 font-medium">Company</th>
                        <th className="px-5 py-3 font-medium">Requested</th>
                        <th className="px-5 py-3 font-medium">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-stroke-soft-200">
                    {pending.map((request) => (
                        <tr key={request.id} className="text-label-sm">
                            <td className="px-5 py-4 text-strong-950">
                                {request.fullName}
                            </td>
                            <td className="px-5 py-4 text-sub-600">
                                {request.email}
                            </td>
                            <td className="px-5 py-4 text-sub-600">
                                {request.companyName}
                            </td>
                            <td className="px-5 py-4 text-sub-600">
                                {dateFormatter.format(
                                    new Date(request.createdAt)
                                )}
                            </td>
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                disabled={readOnly}
                                                className="text-label-sm text-blue-500 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                                                onClick={() => onApprove(request.id)}
                                            >
                                                Approve
                                            </button>
                                            <button
                                                type="button"
                                                disabled={readOnly}
                                                className="text-label-sm text-red-500 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                                                onClick={() => onDeny(request.id)}
                                            >
                                                Deny
                                            </button>
                                        </div>
                                    </td>
                        </tr>
                    ))}
                    {pending.length === 0 ? (
                        <tr>
                            <td
                                className="px-5 py-8 text-label-sm text-sub-600"
                                colSpan={5}
                            >
                                No pending access requests
                            </td>
                        </tr>
                    ) : null}
                </tbody>
            </table>
        </div>
    </section>
);

export default AccessRequestsPanel;
