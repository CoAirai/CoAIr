import { useState } from "react";
import Chat from "@/components/Chat";
import Question from "@/components/Question";
import Answer from "@/components/Answer";
import CodeEditor from "@/components/CodeEditor";

const ApiIntegrator = () => {
    const [code, setCode] = useState(`{
  "location": "Paris",
  "temperature": 18,
  "condition": "Partly Cloudy"
}`);

    return (
        <Chat>
            <Question>
                <div className="mb-1">
                    Use the API to get the current weather in Paris.
                </div>
                <a
                    className="text-label-sm text-[#7D52F4] transition-colors hover:text-[#8c71f6]"
                    href="https://api.weatherly.ai/v1/current"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    https://api.weatherly.ai/v1/current
                </a>
            </Question>
            <Answer>
                <div className="flex flex-col gap-1">
                    <div className="">
                        <p>
                            Absolutely! Here&apos;s the result for the API
                            setup, for the current weather in paris.
                        </p>
                        <br />
                        <p className="text-label-md">🔧 API Example</p>
                        <ul className="list-disc list-inside">
                            <li>API Name: Weatherly API</li>
                            <li>
                                Endpoint: https://api.weatherly.ai/v1/current
                            </li>
                            <li>Method: GET</li>
                            <li>
                                Query Params:
                                <ul className="ml-5 list-disc list-inside">
                                    <li>city=Paris</li>
                                    <li>unit=celsius</li>
                                </ul>
                            </li>
                            <li>Response Example:</li>
                        </ul>
                    </div>
                    <CodeEditor
                        title="Json"
                        language="json"
                        initialCode={code}
                        onCodeChange={setCode}
                    />
                    <div className="">
                        It’s currently 18°C and partly cloudy in Paris. A lovely
                        day to be outside!
                    </div>
                </div>
            </Answer>
        </Chat>
    );
};

export default ApiIntegrator;
