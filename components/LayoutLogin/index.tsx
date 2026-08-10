"use client";

import Link from "next/link";
import Image from "@/components/Image";
import Button from "@/components/Button";
import Icon from "@/components/Icon";
import Slider from "./Slider";

type Props = {
    children: React.ReactNode;
    title: string;
    description: React.ReactNode;
};

const LayoutLogin = ({ title, description, children }: Props) => (
    <div className="p-5">
        <div className="flex min-h-[calc(100svh-2.5rem)]">
            <div className="relative w-1/2 overflow-hidden text-static-white max-lg:hidden">
                <Image
                    className="rounded-3xl object-cover"
                    src="/images/auth-pic.jpg"
                    fill
                    sizes="(max-width: 1023px) 100vw, 50vw"
                    alt=""
                />
                <div className="absolute top-19 left-10 right-10 max-2xl:top-8 max-2xl:left-8 max-2xl:right-8">
                    <div className="mb-4 text-h1 max-2xl:text-h3">
                        Chat, cite, and verify your project data
                    </div>
                    <div className="text-p-lg max-2xl:text-p-md">
                        COAir keeps drawings, comms, and answers in one
                        workspace your whole team can trust.
                    </div>
                </div>
                <Slider />
            </div>
            <div className="flex w-1/2 flex-col pl-12 max-lg:w-full max-lg:pl-0">
                <div className="mb-auto flex items-center justify-between">
                    <div>
                        <div className="text-[1.125rem] font-bold">COAir</div>
                        <div className="-mt-1 text-soft-400">
                            Project intelligence
                        </div>
                    </div>
                    <Button
                        className="!h-10 !gap-3 rounded-xl bg-white-0"
                        isStroke
                        as="link"
                        href="/auth/sign-in"
                    >
                        coair.ai
                        <Icon className="!size-4.5" name="chevron-circle" />
                    </Button>
                </div>
                <div className="mx-auto my-6 w-full max-w-89">
                    <div className="mb-7 text-center max-md:mb-4">
                        <Link className="mb-6 inline-flex max-md:mb-4" href="/auth/sign-in">
                            <Image
                                className="w-18 rounded-xl object-contain opacity-100 max-md:w-14"
                                src="/images/coair-logo.png"
                                width={68}
                                height={68}
                                alt="COAir"
                            />
                        </Link>
                        <div className="text-h3 max-md:text-[1.6rem]">{title}</div>
                        <div className="mt-1.5 text-h6 max-md:text-label-md">
                            {description}
                        </div>
                    </div>
                    {children}
                </div>
                <div className="mt-auto flex h-15 items-center justify-between max-2xl:h-auto">
                    <div className="text-label-sm text-sub-600">© COAir</div>
                    <a
                        className="group flex items-center gap-2 text-label-sm text-sub-600 transition-colors hover:text-strong-950"
                        href="mailto:hello@coair.ai"
                    >
                        <Icon
                            className="!size-4.5 fill-sub-600 transition-colors group-hover:fill-strong-950"
                            name="envelope"
                        />
                        hello@coair.ai
                    </a>
                </div>
            </div>
        </div>
    </div>
);

export default LayoutLogin;
