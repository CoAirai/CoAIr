"use client";

import Link from "next/link";
import Image from "@/components/Image";
import Button from "@/components/Button";
import Icon from "@/components/Icon";
import { authHref } from "@/lib/auth/hosts";
import Slider from "./Slider";

type Props = {
    children: React.ReactNode;
    title: string;
    description: React.ReactNode;
};

const LayoutLogin = ({ title, description, children }: Props) => (
    <div className="min-h-svh bg-weak-50/60 p-5">
        <div className="flex min-h-[calc(100svh-2.5rem)] overflow-hidden rounded-3xl bg-white-0 shadow-[0_1px_2px_rgba(14,18,27,0.04),0_24px_48px_-24px_rgba(14,18,27,0.12)] max-lg:rounded-2xl">
            <div className="relative w-1/2 overflow-hidden text-static-white max-lg:hidden">
                <Image
                    className="object-cover"
                    src="/images/auth-pic.jpg"
                    fill
                    sizes="(max-width: 1023px) 100vw, 50vw"
                    alt=""
                />
                <div className="absolute inset-0 bg-gradient-to-t from-static-black/55 via-static-black/20 to-transparent" />
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
