"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "@/components/Image";
import Button from "@/components/Button";
import Icon from "@/components/Icon";
import { authHref } from "@/lib/auth/hosts";
// The product preview is decorative and hidden on small screens, so it loads
// after the sign-in form instead of blocking it.
const Preview = dynamic(() => import("./Preview"), { ssr: false });

type Props = {
    children: React.ReactNode;
    title: string;
    description: React.ReactNode;
};

const LayoutLogin = ({ title, description, children }: Props) => (
    <div className="min-h-svh bg-weak-50/60 p-5">
        <div className="flex min-h-[calc(100svh-2.5rem)] overflow-hidden rounded-3xl bg-white-0 shadow-[0_1px_2px_rgba(14,18,27,0.04),0_24px_48px_-24px_rgba(14,18,27,0.12)] max-lg:rounded-2xl">
            <div className="flex w-1/2 overflow-hidden bg-[#0C1E2E] max-lg:hidden">
                <Preview className="w-full" />
            </div>
            <div className="flex w-1/2 flex-col px-12 py-8 max-lg:w-full max-lg:px-6 max-md:px-4">
                <div className="mb-auto flex items-center justify-between gap-4">
                    <Link
                        className="inline-flex items-center gap-3"
                        href={authHref("/auth/sign-in")}
                    >
                        <Image
                            className="w-10 rounded-xl object-contain opacity-100"
                            src="/images/coair-logo.png"
                            width={40}
                            height={40}
                            alt="COAir"
                        />
                        <div>
                            <div className="text-label-md font-medium text-strong-950">
                                COAir
                            </div>
                            <div className="text-label-xs text-sub-600">
                                Project intelligence
                            </div>
                        </div>
                    </Link>
                    <Button
                        className="!h-10 !gap-3 rounded-xl bg-white-0"
                        isStroke
                        as="link"
                        href={authHref("/auth/sign-in")}
                    >
                        Sign in
                        <Icon className="!size-4.5" name="chevron-circle" />
                    </Button>
                </div>
                <div className="mx-auto my-8 w-full max-w-89">
                    <div className="mb-7 max-md:mb-5">
                        <div className="text-h3 tracking-tight max-md:text-[1.6rem]">
                            {title}
                        </div>
                        <div className="mt-2 text-label-md leading-relaxed text-sub-600 max-md:text-label-sm">
                            {description}
                        </div>
                    </div>
                    {children}
                </div>
                <div className="mt-auto flex h-15 items-center justify-between max-2xl:h-auto">
                    <div className="text-label-sm text-sub-600">© COAir</div>
                    <a
                        className="group flex items-center gap-2 text-label-sm text-sub-600 transition-colors hover:text-strong-950"
                        href="mailto:help@coair.ai"
                    >
                        <Icon
                            className="!size-4.5 fill-sub-600 transition-colors group-hover:fill-strong-950"
                            name="envelope"
                        />
                        help@coair.ai
                    </a>
                </div>
            </div>
        </div>
    </div>
);

export default LayoutLogin;
