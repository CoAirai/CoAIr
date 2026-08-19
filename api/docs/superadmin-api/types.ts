/**
 * COAir admin API — TypeScript contract.
 *
 * Hand-maintained to match the live responses; mirrors the internal
 * frontend/src/types/api.ts. Drop this file into your project as-is.
 * See API_REFERENCE.md for semantics and ERRORS.md for failure shapes.
 */

// ── Roles and scoping ───────────────────────────────────────

/** Global role, carried in the JWT `role` claim. */
export type Role = 'user' | 'admin' | 'superadmin';

/** Per-project membership role. A global admin acts as `owner` everywhere. */
export type ProjectRole = 'owner' | 'editor' | 'viewer';

/**
 * Role inside a customer company. `owner` is the company SuperAdmin.
 * Independent of `Role`: a company SuperAdmin is a plain global `user`.
 */
export type OrgRole = 'owner' | 'member';

/** How the caller reached a project. */
export type RoleSource = 'member' | 'org' | 'platform';

/** `admin` and `superadmin` are interchangeable except for operator management. */
export const isOperator = (role?: Role): boolean =>
  role === 'admin' || role === 'superadmin';

/** Metering model. `legacy` is unmetered — every operator account is legacy. */
export type PlanType = 'demo' | 'legacy';

// ── Auth ────────────────────────────────────────────────────

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  user: AuthUser;
}

/** Returned by POST /auth/login and (wrapped in `{user}`) by GET /auth/me. */
export interface AuthUser {
  username: string;
  display_name: string;
  role: Role;
  features: Record<string, boolean>;
  token_limit: number;
  used_tokens: number;
  percent_remaining: number;
  plan_type: PlanType;
  credits_total: number;
  credits_remaining: number;
  credits_used: number;
  credit_percent_remaining: number;
  storage_used_bytes: number;
  /** 0 means unlimited. */
  storage_limit_bytes: number;
  storage_percent_used: number;
}

export interface MeResponse {
  user: AuthUser;
}

// ── Users ───────────────────────────────────────────────────

/** Returned by GET/POST/PATCH /admin/users — AuthUser plus admin-only fields. */
export interface AdminUser extends AuthUser {
  id: number;
  /** Present on GET /admin/users; null for platform operators. */
  org_id?: string | null;
  org_name?: string | null;
  org_role?: OrgRole | null;
  /** 0 means unlimited. */
  token_limit: number;
  is_active: boolean;
  /** ISO 8601, UTC, without a timezone suffix. */
  created_at: string;
  updated_at: string;
  total_calls: number;
  markup_percent: number;
  model_policy: string;
  /** Whether a dedicated provider key is bound. The key itself is never returned. */
  dedicated_provider_key: boolean;
}

export interface AdminUserListResponse {
  users: AdminUser[];
}

export interface CreateUserRequest {
  /** 3–64 chars, unique, immutable. */
  username: string;
  /** ≥ 6 chars. */
  password: string;
  display_name?: string | null;
  /** Defaults to 'user'. 'admin' | 'superadmin' require a superadmin caller. */
  role?: Role;
  token_limit?: number;
  features?: Record<string, boolean>;
  /** Ignored for operator accounts — they are always 'legacy'. */
  plan_type?: PlanType;
  initial_credits?: number;
  /** 0–1000. */
  markup_percent?: number;
  storage_limit_bytes?: number;
  model_policy?: string;
  /** Alias of a server-mounted key, ≤ 64 chars. Never send key material. */
  provider_key_ref?: string;
}

/**
 * Every field optional. Omitted (or null) means "leave unchanged" — there is no
 * way to null a value out. `features` replaces the entire map.
 */
export interface UpdateUserRequest {
  display_name?: string;
  role?: Role;
  token_limit?: number;
  features?: Record<string, boolean>;
  is_active?: boolean;
  password?: string;
  plan_type?: PlanType;
  markup_percent?: number;
  storage_limit_bytes?: number;
  model_policy?: string;
  provider_key_ref?: string;
}

export interface CreditAdjustmentRequest {
  /** Signed: negative claws credit back. */
  credits: number;
  /** 3–500 chars, written to the audit ledger. */
  reason: string;
  /** Recommended — replaying the same key is a no-op, so retries are safe. */
  idempotency_key?: string;
}

/** Returned by the credit adjustment endpoint. */
export interface BillingSummary {
  plan_type: PlanType;
  credits_total: number;
  credits_remaining: number;
  credits_used: number;
  credit_percent_remaining: number;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  storage_percent_used: number;
  markup_percent: number;
  model_policy: string;
  dedicated_provider_key: boolean;
}

/** Returned by POST /admin/users/{username}/reset-usage. */
export interface UsageCounters {
  username: string;
  used_tokens: number;
  token_limit: number;
  percent_remaining: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_calls: number;
}

// ── Usage and billing ───────────────────────────────────────

export interface GlobalUsage {
  used_usd: number;
  limit_usd: number;
  remaining_usd: number;
  /** A fraction (0.9982), not a percentage. */
  remaining_pct: number;
  over_budget: boolean;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  total_calls: number;
}

export interface BillingUsageQuery {
  username?: string;
  project_id?: string;
  /** ISO date, inclusive. */
  date_from?: string;
  date_to?: string;
}

export interface BillingUsageGroup {
  project_id: string | null;
  username: string;
  provider: string;
  model: string;
  task_type: string;
  pricing_version: string;
  usage_source: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  estimated_provider_cost_usd: number;
  retail_credit: number;
  debited_credit: number;
  /** Usage served but not covered by a balance. */
  uncovered_credit: number;
  uncovered_provider_cost_usd: number;
  markup_percent: number;
}

export interface BillingUsageResponse {
  groups: BillingUsageGroup[];
}

// ── Organizations ───────────────────────────────────────────

export interface Organization {
  org_id: string;
  name: string;
  slug: string;
  created_at: string;
  archived_at: string | null;
}

/** Company defaults. Only a platform operator can change these. */
export interface OrgPolicy {
  default_plan_type: PlanType;
  default_credits: number;
  default_token_limit: number;
  default_storage_bytes: number;
  /** 0 = unlimited. */
  project_limit: number;
  /** When false, only the owner may create projects. */
  allow_member_projects: boolean;
}

export interface OrgCounts {
  members: number;
  owners: number;
  projects: number;
  archived_projects: number;
}

/** GET /org */
export interface OrgResponse {
  org: Organization;
  role: OrgRole;
  policy: OrgPolicy;
  counts: OrgCounts;
}

/**
 * A user as its own company admin may see it — deliberately narrower than
 * AdminUser: no markup, model policy or provider-key state.
 */
export interface OrgUser {
  username: string;
  display_name: string;
  org_role: OrgRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  features: Record<string, boolean>;
  token_limit: number;
  used_tokens: number;
  percent_remaining: number;
  total_calls: number;
  plan_type: PlanType;
  credits_total: number;
  credits_remaining: number;
  credits_used: number;
  credit_percent_remaining: number;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  storage_percent_used: number;
  /** How many of the company's projects this user can reach. */
  project_count: number;
}

/**
 * POST /org/users. Note what is absent: role, plan, credits and quota are not a
 * company's to set — they come from the company policy.
 */
export interface CreateOrgUserRequest {
  username: string;
  password: string;
  display_name?: string;
  /** Only `correspondence` and `provider_compare` are honoured. */
  features?: Record<string, boolean>;
}

export interface UpdateOrgUserRequest {
  display_name?: string;
  password?: string;
  is_active?: boolean;
  features?: Record<string, boolean>;
  org_role?: OrgRole;
}

export interface ProjectMember {
  username: string;
  display_name?: string;
  role: ProjectRole;
  created_at: string;
  is_active?: boolean;
}

// ── Projects ────────────────────────────────────────────────

export interface Project {
  project_id: string;
  name: string;
  role: ProjectRole;
  embedding_profile: string;
  archived_at?: string | null;
  /** The owning company, or null for projects that predate organizations. */
  org_id?: string | null;
  role_source?: RoleSource;
  /** Only on GET /org/projects. */
  member_count?: number;
  stats?: Record<string, number>;
  usage?: ProjectUsage;
}

export interface ProjectUsage {
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  credits_used: number;
  /** Admin-only fields below. */
  retail_credits?: number;
  estimated_provider_cost_usd?: number;
  uncovered_provider_cost_usd?: number;
  uncovered_credits?: number;
}

export interface ProjectListResponse {
  projects: Project[];
  account_usage: BillingSummary & UsageCounters;
}

// ── Errors ──────────────────────────────────────────────────

/** Standard FastAPI error. `detail` is an object for 409 embedding conflicts. */
export interface ApiError {
  detail: string | Record<string, unknown> | ValidationIssue[];
}

export interface ValidationIssue {
  loc: (string | number)[];
  msg: string;
  type: string;
}

/** Quota/budget failures carry a machine code plus the relevant numbers. */
/** Organization guard rails — plain `{detail}` errors, not domain envelopes. */
export type OrgErrorDetail =
  | 'organization_required'
  | 'org_owner_required'
  | 'organization_archived'
  | 'organization_not_found'
  | 'user_not_in_organization'
  | 'cross_org_membership'
  | 'last_org_owner'
  | 'last_project_owner'
  | 'org_project_limit_reached';

export type DomainErrorCode =
  | 'budget_exceeded'
  | 'token_quota_exceeded'
  | 'credit_balance_exhausted'
  | 'storage_quota_exceeded'
  | 'provider_credential_unavailable';

export interface DomainError {
  detail: string;
  error: DomainErrorCode;
  used_tokens?: number;
  token_limit?: number;
  percent_remaining?: number;
  credits_remaining?: number;
  credit_percent_remaining?: number;
  storage_used_bytes?: number;
  storage_limit_bytes?: number;
  attempted_bytes?: number;
}

export const isDomainError = (body: unknown): body is DomainError =>
  typeof body === 'object' && body !== null && 'error' in body;
