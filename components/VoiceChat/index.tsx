import { useRef, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperType } from "swiper";
import Image from "@/components/Image";
import Icon from "@/components/Icon";
import Button from "@/components/Button";
import "swiper/css";
import "swiper/css/navigation";

import { Navigation } from "swiper/modules";

import { items } from "./items";

const VoiceChat = ({}) => {
    const swiperRef = useRef<SwiperType | null>(null);
    const [isBeginning, setIsBeginning] = useState(false);
    const [isEnd, setIsEnd] = useState(false);
    const [isListening, setIsListening] = useState(false);

    const handlePrev = () => {
        if (swiperRef.current) {
            swiperRef.current.slidePrev();
        }
    };

    const handleNext = () => {
        if (swiperRef.current) {
            swiperRef.current.slideNext();
        }
    };

    const handleSlideChange = (swiper: SwiperType) => {
        setIsBeginning(swiper.isBeginning);
        setIsEnd(swiper.isEnd);
    };

    return isListening ? (
        <>
            <div className="my-auto py-8 text-center max-md:py-3">
                <div className="text-label-lg text-blue-500">
                    I’m listing now...
                </div>
                <div className="mt-3 text-h5 [&>span]:text-sub-600 max-xl:text-[1.5rem] max-md:mt-2 max-md:text-[1.2rem]">
                    &quot;I’ve been trying to log into my account, but every
                    time I enter my credentials, I get an error message saying
                    &apos;Invalid Password.&apos; I’m 100% sure I’m using the
                    correct password since it worked just fine yesterday.{" "}
                    <span>
                        To resolve this, I tried the &apos;Forgot Password&apos;
                        option, but I haven’t received any password reset email
                        yet (I’ve checked my spam/junk folders too).&quot;
                    </span>
                </div>
            </div>
            <div className="max-w-39.5 mx-auto max-md:max-w-30">
                <Image
                    className="w-full"
                    src="/images/ai-voice.png"
                    width={158}
                    height={160}
                    alt="AI Voice"
                />
            </div>
        </>
    ) : (
        <>
            <div className="my-auto py-8 max-2xl:pt-3">
                <div className="max-w-57.5 mx-auto mb-3 max-md:max-w-32 max-md:mb-0">
                    <Image
                        className="w-full"
                        src="/images/ai-voice.png"
                        width={230}
                        height={233}
                        alt="AI Voice"
                    />
                </div>
                <div className="mb-9 text-h4 text-center max-2xl:mb-6 max-md:mb-4 max-md:text-[1.6rem]">
                    Choose a voice
                </div>
                <div className="relative -mx-7.5 overflow-hidden before:absolute before:top-0 before:left-0 before:bottom-0 before:w-40 before:bg-gradient-to-r before:from-white-0 before:to-transparent before:z-5 before:pointer-events-none after:absolute after:top-0 after:right-0 after:bottom-0 after:w-40 after:bg-gradient-to-l after:from-white-0 after:to-transparent after:z-5 after:pointer-events-none max-md:before:hidden max-md:after:hidden">
                    <div className="relative max-w-71.5 mx-auto max-md:max-w-60">
                        <Swiper
                            className="!overflow-visible"
                            spaceBetween={32}
                            slidesPerView={1}
                            // loop={true}
                            centeredSlides={true}
                            initialSlide={1}
                            navigation={false}
                            modules={[Navigation]}
                            onSwiper={(swiper) => {
                                swiperRef.current = swiper;
                                setIsBeginning(swiper.isBeginning);
                                setIsEnd(swiper.isEnd);
                            }}
                            onSlideChange={handleSlideChange}
                            breakpoints={{
                                768: {
                                    spaceBetween: 38,
                                },
                            }}
                        >
                            {items.map((item) => (
                                <SwiperSlide
                                    className="px-5 py-7 border border-stroke-soft-200 rounded-3xl text-center cursor-pointer max-md:p-4 max-md:rounded-2xl"
                                    key={item.id}
                                    onClick={() => setIsListening(true)}
                                >
                                    <div className="mb-2 text-label-xl max-md:text-label-lg">
                                        {item.title}
                                    </div>
                                    <div className="text-label-lg text-sub-600 max-md:text-label-md">
                                        {item.description}
                                    </div>
                                </SwiperSlide>
                            ))}
                        </Swiper>
                        <div className="">
                            {!isBeginning && (
                                <button
                                    className="group prev absolute top-1/2 -left-7 z-1 -translate-y-1/2 max-4xl:-left-8 max-md:-left-7"
                                    onClick={handlePrev}
                                >
                                    <Icon
                                        className="!size-6 fill-strong-950 rotate-90 transition-colors group-hover:fill-blue-500"
                                        name="chevron"
                                    />
                                </button>
                            )}
                            {!isEnd && (
                                <button
                                    className="group next absolute top-1/2 -right-7 z-1 -translate-y-1/2 max-4xl:-right-8 max-md:-right-7"
                                    onClick={handleNext}
                                >
                                    <Icon
                                        className="!size-6 fill-strong-950 -rotate-90 transition-colors group-hover:fill-blue-500"
                                        name="chevron"
                                    />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex flex-col items-center">
                <Button
                    className="min-w-75 h-15 !text-label-md max-md:h-11"
                    icon="plus"
                    isBlack
                >
                    Start new chat
                </Button>
                <button className="mt-6 text-label-md text-strong-950 transition-colors hover:text-blue-500 max-md:mt-4">
                    Cancel
                </button>
            </div>
        </>
    );
};

export default VoiceChat;
