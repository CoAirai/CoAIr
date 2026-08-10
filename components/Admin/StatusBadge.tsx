type Props = {
    status: string;
};

const STATUS_CLASSES: Record<string, string> = {
    active: "bg-green-500/10 text-green-600",
    suspended: "bg-red-500/10 text-red-600",
    trial: "bg-blue-500/10 text-blue-500",
    pending: "bg-orange-500/10 text-orange-600",
};

const StatusBadge = ({ status }: Props) => (
    <span
        className={`inline-flex items-center h-6 px-2.5 rounded-full text-label-xs ${
            STATUS_CLASSES[status.toLowerCase()] ||
            "bg-weak-50 text-sub-600"
        }`}
    >
        {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
);

export default StatusBadge;
