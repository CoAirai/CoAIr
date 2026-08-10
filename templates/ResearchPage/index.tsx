"use client";

import Layout from "@/components/Layout";
import Chat from "@/components/Chat";
import VoiceChat from "@/components/VoiceChat";

const ResearchPage = () => {
    return (
        <Layout>
            <Chat hidePanelMessage>
                <VoiceChat />
            </Chat>
        </Layout>
    );
};

export default ResearchPage;
