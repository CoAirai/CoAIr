export type MessageRole = "user" | "assistant";

export type Citation = {
    documentId: string;
    name: string;
    page: number;
    excerpt: string;
};

export type Message = {
    id: string;
    role: MessageRole;
    content: string;
    createdAt: string;
    authorUserId?: string;
    authorName?: string;
    threadUserId?: string;
    citations?: Citation[];
};

export type KnowledgeBaseItem = {
    id: string;
    label: string;
    count: number | null;
    kind: "assistant" | "documents" | "communications" | "spreadsheets";
};

export type RecentQuery = {
    id: string;
    title: string;
    messages?: Message[];
};
