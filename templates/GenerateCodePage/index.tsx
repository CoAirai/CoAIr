"use client";

import { useState } from "react";
import Layout from "@/components/Layout";
import Chat from "@/components/Chat";
import Question from "@/components/Question";
import Answer from "@/components/Answer";
import CodeEditor from "@/components/CodeEditor";

const GenerateCodePage = () => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [code, setCode] = useState(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Contact Form</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            background-color: #f4f4f9;
        }
        .contact-form {
            background: #fff;
            padding: 20px;
            border-radius: 4px;`);

    const handleGenerateCode = async () => {
        setIsGenerating(true);
        setTimeout(() => {
            setCode(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Contact Form</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            background-color: #f4f4f9;
        }
        .contact-form {
            background: #fff;
            padding: 20px;
            border-radius: 4px;`);
            setIsGenerating(false);
        }, 2000);
    };

    return (
        <Layout>
            <Chat>
                <Question>generate html code for a contact form</Question>
                <Answer>
                    <div className="flex flex-col gap-1.5">
                        <div>
                            Here’s a simple example of HTML code for a contact
                            form:
                        </div>
                        <CodeEditor
                            title="Contact Form"
                            language="html"
                            initialCode={code}
                            onCodeChange={setCode}
                            onGenerate={handleGenerateCode}
                            isGenerating={isGenerating}
                        />
                        <div className="">
                            This code creates a simple, styled contact form that
                            includes fields for a name, email, and message,
                            along with a &quot;Send Message&quot; button. You
                            can further customize the form or integrate it into
                            your website as needed.
                        </div>
                    </div>
                </Answer>
            </Chat>
        </Layout>
    );
};

export default GenerateCodePage;
