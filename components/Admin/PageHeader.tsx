type Props = {
    title: string;
    description?: string;
    action?: React.ReactNode;
};

const PageHeader = ({ title, description, action }: Props) => (
    <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
            <h1 className="text-label-xl font-medium tracking-tight text-strong-950">
                {title}
            </h1>
            {description ? (
                <p className="mt-1 max-w-2xl text-label-sm leading-relaxed text-sub-600">
                    {description}
                </p>
            ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
    </div>
);

export default PageHeader;
