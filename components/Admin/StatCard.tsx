type Props = {
    label: string;
    value: string;
    hint?: string;
};

const StatCard = ({ label, value, hint }: Props) => (
    <div className="surface-panel p-5 transition-shadow duration-200 hover:shadow-[0_8px_24px_-12px_rgba(14,18,27,0.12)]">
        <div className="text-label-sm text-sub-600">{label}</div>
        <div className="mt-2 tabular-nums text-label-xl font-medium tracking-tight text-strong-950">
            {value}
        </div>
        {hint ? (
            <div className="mt-1.5 text-label-xs leading-relaxed text-sub-600">
                {hint}
            </div>
        ) : null}
    </div>
);

export default StatCard;
