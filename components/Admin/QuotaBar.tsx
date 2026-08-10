type Props = {
    label: string;
    used: number;
    limit: number;
    unit?: string;
};

const formatValue = (value: number, unit?: string) =>
    `${value.toLocaleString()}${unit ? ` ${unit}` : ""}`;

const QuotaBar = ({ label, used, limit, unit }: Props) => {
    const remaining = Math.max(0, limit - used);
    const percent =
        limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0;
    const barTone =
        percent >= 90
            ? "bg-error-base"
            : percent >= 75
              ? "bg-warning-base"
              : "bg-blue-500";

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-label-sm">
                <span className="font-medium text-strong-950">{label}</span>
                <span className="tabular-nums text-sub-600">
                    {formatValue(used, unit)} / {formatValue(limit, unit)}
                </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-weak-50">
                <div
                    className={`h-full rounded-full transition-[width] duration-300 ${barTone}`}
                    style={{ width: `${percent}%` }}
                />
            </div>
            <p className="mt-1.5 text-label-xs tabular-nums text-sub-600">
                {formatValue(remaining, unit)} remaining
            </p>
        </div>
    );
};

export default QuotaBar;
