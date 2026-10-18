import type { ChronologyEvent } from "@/lib/chronology/events";

type Props = {
    events: ChronologyEvent[];
    onReviewNext: () => void;
};

const ReviewBar = ({ events, onReviewNext }: Props) => {
    const remaining = events.filter((event) => !event.reviewed).length;
    if (events.length === 0) return null;
    const done = remaining === 0;

    return (
        <div
            className={`sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 shadow-[0_-4px_16px_rgba(14,18,27,0.06)] ${
                done ? "border-green-200 bg-green-50" : "border-stroke-soft-200 bg-white-0"
            }`}
        >
            <span
                className={`inline-block size-2 rounded-full ${done ? "bg-green-500" : "bg-red-500"}`}
            />
            <p className={`text-label-sm ${done ? "text-green-700" : "text-strong-950"}`}>
                {done
                    ? `All ${events.length} entries verified against source.`
                    : `${remaining} of ${events.length} ${remaining === 1 ? "entry needs" : "entries need"} review. Open each source, check it, then mark it verified.`}
            </p>
            {!done ? (
                <button
                    type="button"
                    onClick={onReviewNext}
                    className="ml-auto h-9 rounded-xl bg-strong-950 px-4 text-label-sm font-medium text-white-0 hover:opacity-90"
                >
                    Review next
                </button>
            ) : null}
        </div>
    );
};

export default ReviewBar;
