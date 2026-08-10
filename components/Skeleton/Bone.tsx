type Props = {
    className?: string;
};

const Bone = ({ className = "" }: Props) => (
    <div
        className={`animate-pulse rounded-xl bg-soft-200/80 dark:bg-soft-200/50 ${className}`}
        aria-hidden="true"
    />
);

export default Bone;
