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

    return (
        <div>
            <div className="flex items-center justify-between gap-3 text-label-sm">
                <span className="text-strong-950">{label}</span>
                <span className="text-sub-600">
                    {formatValue(used, unit)} / {formatValue(limit, unit)}{" "}
                    (remaining {formatValue(remaining, unit)})
                </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-weak-50">
                <div
                    className="h-full rounded-full bg-blue-500 transition-[width]"
                    style={{ width: `${percent}%` }}
                />
            </div>
        </div>
    );
};

export default QuotaBar;
