"use client";

import { useState } from "react";
import Layout from "@/components/Layout";
import Chat from "@/components/Chat";
import Question from "@/components/Question";
import Answer from "@/components/Answer";
import Article from "@/components/Article";
import EditorArticle from "@/components/EditorArticle";

import { content } from "./content";

const DocumentGenerationPage = () => {
    const [isEditing, setIsEditing] = useState(false);

    return (
        <Layout>
            {isEditing ? (
                <EditorArticle
                    content={content}
                    onBack={() => setIsEditing(false)}
                />
            ) : (
                <Chat>
                    <Question>
                        generate Document for “non-disclosure agreement”.
                    </Question>
                    <Answer>
                        <div className="flex flex-col gap-1.5">
                            <div className="">
                                Here’s a simple example of HTML code for a
                                contact form:
                            </div>
                            <Article
                                content={content}
                                onEdit={() => setIsEditing(true)}
                            />
                            <div>
                                This code creates a simple, styled contact form
                                that includes fields for a name, email, and
                                message, along with a &quot;Send Message&quot;
                                button. You can further customize the form or
                                integrate it into your website as needed.
                            </div>
                        </div>
                    </Answer>
                </Chat>
            )}
        </Layout>
    );
};

export default DocumentGenerationPage;
