"use client";

import Layout from "@/components/Layout";
import Chat from "@/components/Chat";
import Question from "@/components/Question";
import Answer from "@/components/Answer";
import Chart from "@/components/Chart";
import Button from "@/components/Button";

const DataAnalyticsPage = () => {
    return (
        <Layout>
            <Chat>
                <Question>
                    What’s the trend of Bitcoin between oct 16 and oct 22
                </Question>
                <Answer>
                    <div className="flex flex-col gap-4">
                        <div className="">
                            Sure here is the chart of the bitcoin
                        </div>
                        <Chart />
                        <div className="text-right">
                            <Button
                                className="rounded-lg !bg-weak-50 max-md:w-full"
                                icon="team"
                                isStroke
                            >
                                Send to data team
                            </Button>
                        </div>
                        <div className="">
                            You can change the date by choosing the filter and
                            see more charts.
                        </div>
                    </div>
                </Answer>
            </Chat>
        </Layout>
    );
};

export default DataAnalyticsPage;
