"use client";

import Layout from "@/components/Layout";
import Chat from "@/components/Chat";
import Question from "@/components/Question";
import Answer from "@/components/Answer";

const WriteCopyPage = () => {
    return (
        <Layout>
            <Chat>
                <Question>
                    <div className="">
                        <p>Sure! Here&apos;s a draft outline:</p>
                        <ol className="list-decimal list-inside">
                            <li>Introduction: Understanding Mental Health</li>
                            <li>Why Mental Health Matters</li>
                            <li>Common Challenges and Misconceptions</li>
                            <li>Tips for Promoting Mental Well-being</li>
                            <li>Conclusion: Breaking the Stigma</li>
                        </ol>
                        <p>
                            Would you like me to expand this outline into a full
                            article?
                        </p>
                    </div>
                </Question>
                <Answer>
                    <div className="flex flex-col gap-1">
                        <p>
                            Here’s a simple table of common mental health
                            problems along with potential solutions:
                        </p>
                        <div className="max-md:overflow-auto max-md:scrollbar-none max-md:-mr-4 max-md:pr-4">
                            <table className="w-full table-fixed [&_th]:bg-weak-50 [&_th]:text-left [&_th]:font-medium [&_th]:text-sub-600 [&_td,&_th]:py-2.5 [&_td,&_th]:px-3 [&_td,&_th]:border [&_td,&_th]:border-stroke-soft-200 [&_td]:align-top [&_ul>li]:before:content-['-'] [&_ul>li]:before:mr-1 max-md:w-160">
                                <thead>
                                    <tr>
                                        <th>Mental Health Problem</th>
                                        <th>Description</th>
                                        <th>Solutions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>Anxiety</td>
                                        <td>
                                            Excessive worry or fear impacting
                                            daily activities.
                                        </td>
                                        <td>
                                            <ul>
                                                <li>
                                                    Practice mindfulness and
                                                    relaxation techniques.{" "}
                                                </li>
                                                <li>
                                                    Cognitive-behavioral therapy
                                                    (CBT).
                                                </li>
                                                <li>
                                                    Avoid caffeine and alcohol.
                                                </li>
                                                <li>
                                                    Medication (if prescribed).
                                                </li>
                                            </ul>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>Depression</td>
                                        <td>
                                            Persistent sadness, loss of
                                            interest, and low energy.
                                        </td>
                                        <td>
                                            <ul>
                                                <li>
                                                    Seek professional therapy.
                                                </li>
                                                <li>
                                                    Engage in regular physical
                                                    activity.
                                                </li>
                                                <li>
                                                    Maintain a healthy diet and
                                                    sleep schedule.
                                                </li>
                                                <li>Join support groups.</li>
                                            </ul>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>Stress</td>
                                        <td>
                                            Feeling overwhelmed or unable to
                                            cope with demands.
                                        </td>
                                        <td>
                                            <ul>
                                                <li>
                                                    Time management and
                                                    prioritization.
                                                </li>
                                                <li>
                                                    Regular breaks and
                                                    self-care.
                                                </li>
                                                <li>
                                                    Practice deep breathing or
                                                    meditation.
                                                </li>
                                                <li>
                                                    Talk to a trusted friend or
                                                    therapist.
                                                </li>
                                            </ul>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Answer>
            </Chat>
        </Layout>
    );
};

export default WriteCopyPage;
