import Image from "@/components/Image";

type Props = {
    children: React.ReactNode;
};

const Answer = ({ children }: Props) => (
    <div className="flex">
        <div className="shrink-0">
            <Image
                className="size-9 opacity-100 rounded-full object-cover"
                src="/images/avatar-chat.svg"
                width={36}
                height={36}
                alt="Avatar"
            />
        </div>
        <div className="w-[calc(100%-2.25rem)] pl-3">
            <div className="mb-1 text-label-sm">Odyssey AI</div>
            {children}
        </div>
    </div>
);

export default Answer;
