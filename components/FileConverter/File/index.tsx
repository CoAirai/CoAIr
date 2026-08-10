import Image from "@/components/Image";

type Props = {
    name: string;
    size: string;
};

const File = ({ name, size }: Props) => (
    <div className="flex items-center gap-3 max-w-97 h-12 border border-stroke-soft-200 bg-weak-50 rounded-lg px-3.5">
        <div className="flex justify-center items-center size-7 rounded-sm bg-blue-50">
            <Image
                src="/images/doc-type.svg"
                className="w-4.25 opacity-100"
                width={15}
                height={14}
                alt="File"
            />
        </div>
        <div className="text-label-sm">{name}</div>
        <div className="flex items-center ml-auto text-soft-400">
            <div className="text-p-xs">PDF</div>
            <div className="size-0.75 mx-1 rounded-full bg-soft-400"></div>
            <div className="text-label-xs">{size}</div>
        </div>
    </div>
);

export default File;
