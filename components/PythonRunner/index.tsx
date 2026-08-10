import { useState } from "react";
import Chat from "@/components/Chat";
import Question from "@/components/Question";
import Answer from "@/components/Answer";
import CodeEditor from "@/components/CodeEditor";

const PythonRunner = () => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [code, setCode] = useState(`# Def
def is_prime(n):
    # condition
    if n <= 1:
        return False
    # for
    for i in range(2, int(n**0.5) + 1):
        if n % i == 0:
            return False
    return True`);

    const handleGenerateCode = async () => {
        setIsGenerating(true);
        setTimeout(() => {
            setCode(`# Def
def is_prime(n):
    # condition
    if n <= 1:
        return False
    # for
    for i in range(2, int(n**0.5) + 1):
        if n % i == 0:
            return False
    return True

# Test the function
print(is_prime(17))  # True
print(is_prime(15))  # False`);
            setIsGenerating(false);
        }, 2000);
    };

    return (
        <Chat>
            <Question>
                Write a Python function that checks if a number is prime.
            </Question>
            <Answer>
                <div className="mb-1">Sure here is the response:</div>
                <CodeEditor
                    title="Contact Form"
                    language="python"
                    initialCode={code}
                    onCodeChange={setCode}
                    onGenerate={handleGenerateCode}
                    isGenerating={isGenerating}
                />
            </Answer>
        </Chat>
    );
};

export default PythonRunner;
