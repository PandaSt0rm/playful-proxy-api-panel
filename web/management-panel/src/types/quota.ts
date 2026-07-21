/**
 * Quota management types.
 */

// Theme types
export type ThemeColors = { bg: string; text: string; border?: string };
export type TypeColorSet = { light: ThemeColors; dark?: ThemeColors };
export type ResolvedTheme = 'light' | 'dark';

// API payload types
export interface GeminiCliQuotaBucket {
  modelId?: string;
  model_id?: string;
  tokenType?: string;
  token_type?: string;
  remainingFraction?: number | string;
  remaining_fraction?: number | string;
  remainingAmount?: number | string;
  remaining_amount?: number | string;
  resetTime?: string;
  reset_time?: string;
}

export interface GeminiCliQuotaPayload {
  buckets?: GeminiCliQuotaBucket[];
}

export interface GeminiCliCredits {
  creditType?: string;
  credit_type?: string;
  creditAmount?: string | number;
  credit_amount?: string | number;
}

export interface GeminiCliUserTier {
  id?: string;
  name?: string;
  description?: string;
  availableCredits?: GeminiCliCredits[];
  available_credits?: GeminiCliCredits[];
}

export interface GeminiCliCodeAssistPayload {
  currentTier?: GeminiCliUserTier | null;
  current_tier?: GeminiCliUserTier | null;
  paidTier?: GeminiCliUserTier | null;
  paid_tier?: GeminiCliUserTier | null;
}

export interface AntigravityQuotaInfo {
  displayName?: string;
  quotaInfo?: {
    remainingFraction?: number | string;
    remaining_fraction?: number | string;
    remaining?: number | string;
    resetTime?: string;
    reset_time?: string;
  };
  quota_info?: {
    remainingFraction?: number | string;
    remaining_fraction?: number | string;
    remaining?: number | string;
    resetTime?: string;
    reset_time?: string;
  };
}

export type AntigravityModelsPayload = Record<string, AntigravityQuotaInfo>;

export interface AntigravityQuotaGroupDefinition {
  id: string;
  label: string;
  identifiers: string[];
  labelFromModel?: boolean;
}

export interface GeminiCliQuotaGroupDefinition {
  id: string;
  label: string;
  preferredModelId?: string;
  modelIds: string[];
}

export interface GeminiCliParsedBucket {
  modelId: string;
  tokenType: string | null;
  remainingFraction: number | null;
  remainingAmount: number | null;
  resetTime: string | undefined;
}

export interface CodexUsageWindow {
  used_percent?: number | string;
  usedPercent?: number | string;
  limit_window_seconds?: number | string;
  limitWindowSeconds?: number | string;
  reset_after_seconds?: number | string;
  resetAfterSeconds?: number | string;
  reset_at?: number | string;
  resetAt?: number | string;
}

export interface CodexRateLimitInfo {
  allowed?: boolean;
  limit_reached?: boolean;
  limitReached?: boolean;
  primary_window?: CodexUsageWindow | null;
  primaryWindow?: CodexUsageWindow | null;
  secondary_window?: CodexUsageWindow | null;
  secondaryWindow?: CodexUsageWindow | null;
}

export interface CodexAdditionalRateLimit {
  limit_name?: string;
  limitName?: string;
  metered_feature?: string;
  meteredFeature?: string;
  rate_limit?: CodexRateLimitInfo | null;
  rateLimit?: CodexRateLimitInfo | null;
}

export interface CodexUsagePayload {
  plan_type?: string;
  planType?: string;
  rate_limit?: CodexRateLimitInfo | null;
  rateLimit?: CodexRateLimitInfo | null;
  code_review_rate_limit?: CodexRateLimitInfo | null;
  codeReviewRateLimit?: CodexRateLimitInfo | null;
  additional_rate_limits?: CodexAdditionalRateLimit[] | null;
  additionalRateLimits?: CodexAdditionalRateLimit[] | null;
}

// Claude API payload types
export interface ClaudeUsageWindow {
  utilization: number;
  resets_at: string;
}

export interface ClaudeExtraUsage {
  is_enabled: boolean;
  monthly_limit: number;
  used_credits: number;
  utilization: number | null;
}

export interface ClaudeUsageLimit {
  kind?: string | null;
  percent?: number | null;
  resets_at?: string | null;
  scope?: {
    model?: {
      display_name?: string | null;
    } | null;
  } | null;
}

export interface ClaudeUsagePayload {
  five_hour?: ClaudeUsageWindow | null;
  seven_day?: ClaudeUsageWindow | null;
  seven_day_oauth_apps?: ClaudeUsageWindow | null;
  seven_day_opus?: ClaudeUsageWindow | null;
  seven_day_sonnet?: ClaudeUsageWindow | null;
  seven_day_cowork?: ClaudeUsageWindow | null;
  iguana_necktie?: ClaudeUsageWindow | null;
  limits?: ClaudeUsageLimit[] | null;
  extra_usage?: ClaudeExtraUsage | null;
}

export interface ClaudeProfileResponse {
  account?: {
    uuid?: string;
    full_name?: string;
    display_name?: string;
    email?: string;
    has_claude_max?: boolean;
    has_claude_pro?: boolean;
    created_at?: string;
  };
  organization?: {
    uuid?: string;
    name?: string;
    organization_type?: string;
    billing_type?: string;
    rate_limit_tier?: string;
    has_extra_usage_enabled?: boolean;
    subscription_status?: string;
    subscription_created_at?: string;
  };
}

export interface ClaudeQuotaWindow {
  id: string;
  label: string;
  labelKey?: string;
  usedPercent: number | null;
  resetLabel: string;
}

export interface ClaudeQuotaState {
  status: 'idle' | 'loading' | 'success' | 'error';
  windows: ClaudeQuotaWindow[];
  extraUsage?: ClaudeExtraUsage | null;
  planType?: string | null;
  error?: string;
  errorStatus?: number;
}

// Quota state types
export interface AntigravityQuotaGroup {
  id: string;
  label: string;
  models: string[];
  remainingFraction: number;
  resetTime?: string;
}

export interface AntigravityQuotaState {
  status: 'idle' | 'loading' | 'success' | 'error';
  groups: AntigravityQuotaGroup[];
  error?: string;
  errorStatus?: number;
}

export interface GeminiCliQuotaBucketState {
  id: string;
  label: string;
  remainingFraction: number | null;
  remainingAmount: number | null;
  resetTime: string | undefined;
  tokenType: string | null;
  modelIds?: string[];
}

export interface GeminiCliQuotaState {
  status: 'idle' | 'loading' | 'success' | 'error';
  buckets: GeminiCliQuotaBucketState[];
  tierLabel?: string | null;
  tierId?: string | null;
  creditBalance?: number | null;
  error?: string;
  errorStatus?: number;
}

export interface CodexQuotaWindow {
  id: string;
  label: string;
  labelKey?: string;
  labelParams?: Record<string, string | number>;
  usedPercent: number | null;
  resetLabel: string;
}

export interface CodexQuotaState {
  status: 'idle' | 'loading' | 'success' | 'error';
  windows: CodexQuotaWindow[];
  planType?: string | null;
  error?: string;
  errorStatus?: number;
}

// Kimi API payload types
export interface KimiUsageDetail {
  used?: number;
  limit?: number;
  remaining?: number;
  name?: string;
  title?: string;
  resetAt?: string;
  reset_at?: string;
  resetTime?: string;
  reset_time?: string;
  resetIn?: number;
  reset_in?: number;
  ttl?: number;
}

export interface KimiLimitWindow {
  duration?: number;
  timeUnit?: string;
}

export interface KimiLimitItem {
  name?: string;
  title?: string;
  scope?: string;
  detail?: KimiUsageDetail;
  window?: KimiLimitWindow;
  used?: number;
  limit?: number;
  remaining?: number;
  duration?: number;
  timeUnit?: string;
  resetAt?: string;
  reset_at?: string;
  resetIn?: number;
  reset_in?: number;
  ttl?: number;
}

export interface KimiUsagePayload {
  usage?: KimiUsageDetail;
  limits?: KimiLimitItem[];
}

export interface KimiQuotaRow {
  id: string;
  label?: string;
  labelKey?: string;
  labelParams?: Record<string, string | number>;
  used: number;
  limit: number;
  resetHint?: string;
}

export interface KimiQuotaState {
  status: 'idle' | 'loading' | 'success' | 'error';
  rows: KimiQuotaRow[];
  error?: string;
  errorStatus?: number;
}

// Z.AI API payload types
export interface ZaiQuotaLimit {
  type?: string;
  percentage?: number | string;
  currentValue?: number | string;
  current_value?: number | string;
  currentUsage?: number | string;
  current_usage?: number | string;
  usage?: number | string;
  remaining?: number | string;
  total?: number | string;
  limit?: number | string;
  /** Intentional: mirrors an upstream Z.AI response field that is misspelled
   *  "totol". Kept as a read fallback (see builders.ts toZaiQuotaRow); do not
   *  "correct" the spelling or the fallback silently stops matching the API. */
  totol?: number | string;
  nextResetTime?: number | string;
  next_reset_time?: number | string;
  resetTime?: number | string;
  reset_time?: number | string;
  resetAt?: number | string;
  reset_at?: number | string;
  resetIn?: number | string;
  reset_in?: number | string;
  ttl?: number | string;
  usageDetails?: unknown;
  usage_details?: unknown;
}

export interface ZaiQuotaPayload {
  data?: {
    limits?: ZaiQuotaLimit[];
  };
  limits?: ZaiQuotaLimit[];
}

export interface ZaiQuotaRow {
  id: string;
  label?: string;
  labelKey?: string;
  usedPercent: number | null;
  remainingPercent: number | null;
  currentValue: number | null;
  limit: number | null;
  resetHint?: string;
}

export interface ZaiQuotaState {
  status: 'idle' | 'loading' | 'success' | 'error';
  rows: ZaiQuotaRow[];
  error?: string;
  errorStatus?: number;
}

// xAI / Grok SuperGrok billing payload types
/** Unit wrapper used by Grok CLI billing (`{ val: N }` or plain number/string). */
export interface XaiBillingUnit {
  val?: number | string;
  value?: number | string;
}

export type XaiBillingAmount = number | string | XaiBillingUnit | null | undefined;

export interface XaiBillingConfig {
  used?: XaiBillingAmount;
  /** CLI billing schema field; window length comes from billingPeriodStart/End. */
  monthlyLimit?: XaiBillingAmount;
  monthly_limit?: XaiBillingAmount;
  weeklyLimit?: XaiBillingAmount;
  weekly_limit?: XaiBillingAmount;
  limit?: XaiBillingAmount;
  onDemandCap?: XaiBillingAmount;
  on_demand_cap?: XaiBillingAmount;
  billingPeriodEnd?: string | number | null;
  billing_period_end?: string | number | null;
  billingPeriodStart?: string | number | null;
  billing_period_start?: string | number | null;
}

export interface XaiBillingPayload {
  config?: XaiBillingConfig | null;
  used?: XaiBillingAmount;
  monthlyLimit?: XaiBillingAmount;
  monthly_limit?: XaiBillingAmount;
  weeklyLimit?: XaiBillingAmount;
  weekly_limit?: XaiBillingAmount;
  limit?: XaiBillingAmount;
  onDemandCap?: XaiBillingAmount;
  on_demand_cap?: XaiBillingAmount;
  billingPeriodEnd?: string | number | null;
  billing_period_end?: string | number | null;
  billingPeriodStart?: string | number | null;
  billing_period_start?: string | number | null;
  subscription_tier_display?: string | null;
  subscriptionTierDisplay?: string | null;
}

export interface XaiQuotaRow {
  id: string;
  label?: string;
  labelKey?: string;
  labelParams?: Record<string, string | number>;
  used: number;
  limit: number;
  resetHint?: string;
}

export interface XaiQuotaState {
  status: 'idle' | 'loading' | 'success' | 'error';
  rows: XaiQuotaRow[];
  planType?: string | null;
  error?: string;
  errorStatus?: number;
}
