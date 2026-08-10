import Link from "next/link";

import Image from "@/components/Image";

type Props = {
    item: {
        id: number;
        title: string;
        description: string;
        icon: string;
        href: string;
    };
};

const Item = ({ item }: Props) => (
    <Link
        className="w-[calc(33.333%-0.75rem)] min-h-41 mt-3 mx-1.5 p-3 border border-stroke-soft-200 rounded-xl bg-gradient-to-r from-white-0 to-weak-50 transition-colors hover:border-stroke-sub-300 max-md:w-[calc(50%-0.75rem)]"
        href={item.href}
    >
        <div className="flex justify-center items-center size-12.5 mb-3 rounded-2xl bg-weak-50">
            <Image
                className="w-6 opacity-100"
                src={item.icon}
                width={24}
                height={24}
                alt={item.title}
            />
        </div>
        <div className="mb-1 text-label-lg max-md:text-[0.9375rem]">
            {item.title}
        </div>
        <div className="text-soft-400">{item.description}</div>
    </Link>
);

export default Item;
