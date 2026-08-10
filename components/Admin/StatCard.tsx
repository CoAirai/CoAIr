type Props = {
    label: string;
    value: string;
    hint?: string;
};

const StatCard = ({ label, value, hint }: Props) => (
    <div className="rounded-2xl border border-stroke-soft-200 bg-white-0 p-5">
        <div className="text-label-sm text-sub-600">{label}</div>
        <div className="mt-2 text-label-xl text-strong-950">{value}</div>
        {hint && <div className="mt-1 text-label-xs text-sub-600">{hint}</div>}
    </div>
);

export default StatCard;
