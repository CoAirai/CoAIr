export type CoairUserPayload = {
    username: string;
    display_name: string;
    role: string;
    features?: Record<string, boolean>;
};

export type CoairLoginResponse = {
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
    mfa_required?: boolean;
    mfa_token?: string;
    debug_code?: string;
    user: CoairUserPayload;
};

export type CoairOrgResponse = {
    org?: {
        org_id?: string;
        name?: string;
        slug?: string;
    };
    role?: string;
    counts?: {
        members?: number;
        owners?: number;
        projects?: number;
    };
    subscription?: {
        plan_id?: string;
        needs_checkout?: boolean;
        sell_tokens_per_usd_override?: number | null;
        status?: string;
        auto_renew?: boolean;
        cancel_at_period_end?: boolean;
        current_period_end?: string | null;
        stripe_subscription_id?: string | null;
    };
};

export type CoairProject = {
    project_id: string;
    name: string;
};

export type CoairProjectsResponse = {
    projects: CoairProject[];
};

export type CoairConversationMeta = {
    conversation_id: string;
    title: string;
};

export type CoairCitation = {
    doc_id?: string;
    doc_name?: string;
    anchor?: string;
    snippet?: string;
};

export type CoairChatResponse = {
    ui_intent?: string;
    assistant_text: string;
    citations?: CoairCitation[];
};
