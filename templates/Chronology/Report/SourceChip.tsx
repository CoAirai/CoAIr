import { fileKindLabel } from "@/lib/chat/citations";
import type { ChronologyEventSource } from "@/lib/chronology/events";

type Props = {
    source: ChronologyEventSource;
    active?: boolean;
    onOpen: (source: ChronologyEventSource) => void;
};

const SourceChip = ({ source, active, onOpen }: Props) => (
    <button
        type="button"
        title={source.title ? `${source.name} — ${source.title}` : source.name}
        onClick={(event) => {
            event.stopPropagation();
            onOpen(source);
        }}
        className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-left text-label-xs transition-colors ${
            active
                ? "border-strong-950 bg-weak-50 text-strong-950"
                : "border-stroke-soft-200 bg-white-0 text-strong-950 hover:border-stroke-sub-300"
        }`}
    >
        <span className="shrink-0 rounded bg-weak-50 px-1 py-px text-[9.5px] font-semibold tracking-wide text-sub-600">
            {fileKindLabel(source.name)}
        </span>
        <span className="truncate font-mono text-[11.5px]">
            {source.name.replace(/\.[a-z0-9]+$/i, "")}
        </span>
        <span className="shrink-0 whitespace-nowrap text-sub-600">{source.pinpoint}</span>
    </button>
);

export default SourceChip;
