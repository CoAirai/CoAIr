import { coairFetch } from "./client";
import { mapLiveCitations } from "./mapCitations";
import type { CoairCitation } from "./types";
import type { Message } from "@/lib/chat/types";

export type StoredConversation = {
    conversation_id: string;
    title: string;
    messages: Array<{
        role: string;
        content: string;
        timestamp: string;
        response?: { assistant_text?: string; citations?: CoairCitation[]; sql_artifact?: import("@/lib/chat/types").SqlArtifact | null } | null;
    }>;
};

export function listConversations(token: string, projectId: string) {
    return coairFetch<Array<{ conversation_id: string; title: string }>>(
        "/conversations", { token, projectId }
    );
}

export function loadConversation(token: string, projectId: string, id: string) {
    return coairFetch<StoredConversation>(`/conversations/${encodeURIComponent(id)}`, {
        token, projectId,
    });
}

export function conversationMessages(conversation: StoredConversation, userId: string): Message[] {
    return conversation.messages
        .filter(message => message.role === "user" || message.role === "assistant")
        .map((message, index) => ({
            id: `${conversation.conversation_id}-${index}`,
            role: message.role as "user" | "assistant",
            content: message.role === "assistant" ? message.response?.assistant_text ?? message.content : message.content,
            sqlArtifact: message.role === "assistant" ? message.response?.sql_artifact ?? undefined : undefined,
            createdAt: message.timestamp,
            threadUserId: userId,
            authorUserId: message.role === "user" ? userId : undefined,
            citations: mapLiveCitations(message.response?.citations),
        }));
}
