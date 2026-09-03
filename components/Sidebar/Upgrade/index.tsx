"use client";

import Link from "next/link";
import Image from "@/components/Image";
import Icon from "@/components/Icon";

const Upgrade = () => (
    <div className="mt-8 max-md:mt-6">
        <div className="">
            <Image
                className="w-full opacity-100 dark:hidden"
                src="/images/upgrade-pic-light.png"
                width={220}
                height={140}
                alt="Upgrade"
                priority
            />
            <Image
                className="!hidden w-full opacity-100 dark:!block"
                src="/images/upgrade-pic-dark.png"
                width={220}
                height={140}
                alt="Upgrade"
                priority
            />
        </div>
        <div className="p-3 rounded-b-xl dark:shadow-[inset_0_0_0.1875rem_0_rgba(255,255,255,0.16)]">
            <Link
                href="/company/billing"
                className="group flex items-center gap-1 text-label-md"
            >
                Upgrade plan{" "}
                <Icon
                    className="fill-blue-500 transition-transform group-hover:translate-x-0.5"
                    name="arrow"
                />
            </Link>
            <div className="mt-0.75 text-label-xs text-sub-600">
                Buy storage, tokens, or a higher package with{" "}
                <span className="text-strong-950">Stripe Checkout</span>.
            </div>
        </div>
    </div>
);

export default Upgrade;
