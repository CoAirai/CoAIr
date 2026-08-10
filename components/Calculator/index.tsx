import Chat from "@/components/Chat";
import Question from "@/components/Question";
import Answer from "@/components/Answer";

const Calculator = () => {
    return (
        <Chat>
            <Question>
                solve this problem for me:
                <br />
                Find the derivative of f(x) = x³ + 2x² - 7
            </Question>
            <Answer>
                <div className="mb-1">Sure here is the response:</div>
                <div className="">
                    <p className="text-label-sm">✅ Step-by-step solution:</p>
                    <br />
                    <p>We’ll differentiate f(x) term by term:</p>
                    <ol className="list-decimal list-inside">
                        <li>
                            Derivative of x³ is: <br />
                            &nbsp;&nbsp;&nbsp;&nbsp;→ 3x²
                        </li>
                        <li>
                            Derivative of 2x² is: <br />
                            &nbsp;&nbsp;&nbsp;&nbsp;→ 2 × 2x = 4x
                        </li>
                        <li>
                            Derivative of constant -7 is: <br />
                            &nbsp;&nbsp;&nbsp;&nbsp;→ 0
                        </li>
                    </ol>
                    <br />
                    <p className="text-label-sm">🎯 Final Answer:</p>
                    <p>f&apos;(x) = 3x² + 4x</p>
                </div>
            </Answer>
        </Chat>
    );
};

export default Calculator;
