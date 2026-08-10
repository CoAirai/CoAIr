import Image from "@/components/Image";

type Props = {
    children: React.ReactNode;
};

const Question = ({ children }: Props) => (
    <div className="flex">
        <div className="shrink-0">
            <Image
                className="size-9 opacity-100 rounded-full object-cover"
                src="/images/avatar-2.png"
                width={36}
                height={36}
                alt="Avatar"
            />
        </div>
        <div className="w-[calc(100%-2.25rem)] pl-3">
            <div className="flex items-center gap-2 mb-1">
                <div className="text-label-sm">James Brown</div>
                <div className="-mb-0.75 text-p-xs text-soft-400">1min ago</div>
            </div>
            {children}
        </div>
    </div>
);

export default Question;
