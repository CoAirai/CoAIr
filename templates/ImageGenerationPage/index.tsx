"use client";

import Layout from "@/components/Layout";
import Chat from "@/components/Chat";
import Question from "@/components/Question";
import Answer from "@/components/Answer";
import SoloImage from "@/components/SoloImage";
import Gallery from "@/components/Gallery";

const ImageGenerationPage = () => {
    return (
        <Layout>
            <Chat>
                <Question>generate images for a fantasy landscape</Question>
                <Answer>
                    <div className="flex flex-col gap-1.5">
                        <SoloImage />
                        <div>
                            Here is the fantasy landscape you requested! Let me
                            know if you&apos;d like any adjustments or
                            additional details.
                        </div>
                        <div>Anything else? I’m always here to help.</div>
                    </div>
                </Answer>
                <Question>generate 3 images for a cartoon girl</Question>
                <Answer>
                    <div className="flex flex-col gap-1.5">
                        <Gallery />
                        <div>
                            Here is the fantasy landscape you requested! Let me
                            know if you&apos;d like any adjustments or
                            additional details.
                        </div>
                        <div>Anything else? I’m always here to help.</div>
                    </div>
                </Answer>
            </Chat>
        </Layout>
    );
};

export default ImageGenerationPage;
