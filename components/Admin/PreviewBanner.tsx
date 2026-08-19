type Props = {
    children?: React.ReactNode;
};

const PreviewBanner = ({ children }: Props) => (
    <p className="rounded-2xl border border-stroke-soft-200 bg-weak-50 px-4 py-3 text-label-sm text-sub-600">
        {children ??
            "Showing preview records so you can review the layout. Live rows replace these when the API has data."}
    </p>
);

export default PreviewBanner;
