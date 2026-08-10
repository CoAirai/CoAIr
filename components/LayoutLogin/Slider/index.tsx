"use client";

import { Swiper, SwiperSlide } from "swiper/react";
import { items } from "./items";
import Image from "@/components/Image";
import { useState } from "react";

import "swiper/css";
import "swiper/css/effect-fade";
import { Autoplay } from "swiper/modules";

const SLIDE_DURATION = 3000;

const Slider = () => {
    const [currentSlide, setCurrentSlide] = useState(0);

    return (
        <div className="absolute bottom-15 left-10 right-10 z-2 max-2xl:bottom-8 max-2xl:left-8 max-2xl:right-8">
            <Swiper
                className="mySwiper !overflow-visible"
                spaceBetween={56}
                modules={[Autoplay]}
                autoplay={{
                    delay: SLIDE_DURATION,
                    disableOnInteraction: false,
                }}
                onSlideChange={(swiper) => setCurrentSlide(swiper.activeIndex)}
                speed={500}
            >
                {items.map((item, index) => (
                    <SwiperSlide
                        className="relative rounded-[1.125rem] border border-stroke-soft-200 bg-[#99A0AE]/24 p-5.5 pl-45 backdrop-blur-[0.625rem] max-xl:pl-5.5"
                        key={item.id}
                    >
                        <div className="absolute -left-1 bottom-3 max-xl:hidden">
                            <Image
                                className="w-46.5"
                                src={item.image}
                                width={186}
                                height={170}
                                alt={item.author}
                            />
                        </div>
                        <div className="mb-2 flex items-center gap-3 text-label-lg">
                            <div className="overflow-hidden rounded-xl border border-stroke-soft-200 rotate-[-10deg]">
                                <Image
                                    className="h-9.5 w-10 object-cover"
                                    src={item.avatar}
                                    width={40}
                                    height={38}
                                    alt={item.author}
                                />
                            </div>
                            {item.author}
                            <div className="ml-auto text-label-lg">
                                {index + 1}/{items.length}
                            </div>
                            <div className="h-6.5 w-6.5">
                                <svg
                                    className="h-full w-full -rotate-90 transform"
                                    viewBox="0 0 36 36"
                                >
                                    <circle
                                        cx="18"
                                        cy="18"
                                        r="16"
                                        fill="none"
                                        stroke="rgba(255, 255, 255, 0.2)"
                                        strokeWidth="3"
                                    />
                                    <circle
                                        cx="18"
                                        cy="18"
                                        r="16"
                                        fill="none"
                                        stroke="white"
                                        strokeWidth="3"
                                        strokeDasharray={`${2 * Math.PI * 16}`}
                                        strokeDashoffset={`${2 * Math.PI * 16}`}
                                        strokeLinecap="round"
                                        className={`${
                                            index === currentSlide
                                                ? "animate-progress"
                                                : "opacity-50"
                                        }`}
                                        style={{
                                            animationDuration: `${SLIDE_DURATION}ms`,
                                            animationPlayState:
                                                index === currentSlide
                                                    ? "running"
                                                    : "paused",
                                        }}
                                    />
                                </svg>
                            </div>
                        </div>
                        <div className="line-clamp-2 min-h-12 text-label-sm text-[#CACFD8]">
                            {item.content}
                        </div>
                    </SwiperSlide>
                ))}
            </Swiper>
        </div>
    );
};

export default Slider;
