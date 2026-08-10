import { formatTokenCount } from "@/lib/chat/tokenMeter";

type Props = {
    used: number;
    allocation: number;
    remainingPercent: number;
};

const TokenUsage = ({ used, allocation, remainingPercent }: Props) => {
    const radius = 14;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - remainingPercent / 100);

    return (
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-label-xs text-sub-600">
            <span className="relative size-7 shrink-0">
                <svg className="size-7 -rotate-90" viewBox="0 0 36 36" aria-hidden>
                    <circle
                        cx="18"
                        cy="18"
                        r={radius}
                        fill="none"
                        className="stroke-stroke-soft-200"
                        strokeWidth="3"
                    />
                    <circle
                        cx="18"
                        cy="18"
                        r={radius}
                        fill="none"
                        className="stroke-blue-500 transition-[stroke-dashoffset] duration-500 ease-out"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                    />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium tabular-nums text-strong-950">
                    {remainingPercent}%
                </span>
            </span>
            <span className="tabular-nums">
                {formatTokenCount(used)}/{formatTokenCount(allocation)}
            </span>
        </span>
    );
};

export default TokenUsage;
