export type MessageRole = "user" | "assistant";

export type SqlArtifact = {
    generated_sql: string;
    tables_used: string[];
    row_count: number;
    preview_rows: Record<string, unknown>[];
    columns: string[];
    source_file_id: string;
    source_file_name: string;
    chart?: { type: "bar" | "line"; x: string; y: string[] } | null;
};

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
    sqlArtifact?: SqlArtifact;
    /** How much of the library was indexed when this answer was written. */
    libraryNote?: string;
    streaming?: boolean;
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
    pinned?: boolean;
};
