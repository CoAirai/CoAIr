import type { ChronologyEvent } from "@/lib/chronology/events";
import type { ChronologyReport } from "@/lib/chronology/types";

type Props = {
    report: ChronologyReport;
    events: ChronologyEvent[];
    downloading: boolean;
    onDownloadWord?: () => void;
};

const Stat = ({ value, label, tone }: { value: number; label: string; tone?: string }) => (
    <div className="flex flex-col">
        <b className={`text-[22px] font-semibold leading-tight tabular-nums ${tone ?? "text-strong-950"}`}>
            {value}
        </b>
        <span className="text-label-xs text-sub-600">{label}</span>
    </div>
);

const ReportHeader = ({ report, events, downloading, onDownloadWord }: Props) => {
    const dated = events.filter((event) => event.date);
    const delay = events.filter((event) => event.delay).length;
    const verified = events.filter((event) => event.reviewed).length;
    const documents = new Set(
        events.flatMap((event) => event.sources.map((source) => source.documentId))
    ).size;
    const created = new Date(report.createdAt).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
    const span =
        dated.length > 0
            ? `${dated[0].dateLabel} – ${dated[dated.length - 1].dateLabel}`
            : "";

    return (
        <section className="flex flex-wrap items-start gap-5 rounded-2xl border border-stroke-soft-200 bg-white-0 p-6 max-md:p-4">
            <div className="min-w-0 flex-1">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-soft-400">
                    Chronology {report.reference} · Topic
                </p>
                <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-strong-950 max-md:text-xl">
                    {report.title}
                </h1>
                <p className="mt-1 text-label-sm text-sub-600">
                    {span ? `${span} · ` : ""}
                    {documents} source {documents === 1 ? "document" : "documents"}
                    {report.documentsConsidered
                        ? ` (of ${report.documentsConsidered} considered)`
                        : ""}{" "}
                    · Created {created} ·{" "}
                    <b className="font-semibold text-[#8A5200]">
                        {verified === events.length && events.length > 0
                            ? "All entries verified"
                            : "Preliminary"}
                    </b>
                </p>
                <div className="mt-4 flex flex-wrap gap-6">
                    <Stat value={events.length} label="events" />
                    <Stat value={delay} label="delay-related" tone="text-[#8A5200]" />
                    <Stat value={verified} label="verified" tone="text-green-600" />
                    {events.length - verified > 0 ? (
                        <Stat
                            value={events.length - verified}
                            label="need review"
                            tone="text-red-500"
                        />
                    ) : null}
                </div>
            </div>
            {onDownloadWord ? (
                <button
                    type="button"
                    disabled={downloading}
                    onClick={onDownloadWord}
                    className="h-10 rounded-xl bg-strong-950 px-4 text-label-sm font-medium text-white-0 hover:opacity-90 disabled:opacity-60"
                >
                    {downloading ? "Preparing Word…" : "Download Word"}
                </button>
            ) : null}
        </section>
    );
};

export default ReportHeader;
