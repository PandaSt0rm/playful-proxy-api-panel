/**
 * Sync profile types for the AIPROXYI config sync system.
 * Matches server-side types in internal/config/sync_profiles.go and
 * internal/api/handlers/management/sync.go.
 */

// --- Sync Profile Config Model ---

/** A single target within a sync profile, specifying a CLI tool to configure. */
export interface SyncProfileTarget {
  /** CLI tool identifier (e.g., "factory-droid", "claude-code", "hermes"). */
  tool: string;
  /** Optional regex pattern — only models matching this filter are synced. */
  'model-filter'?: string;
  /** 0-based index into the server's api-keys list. */
  'api-key-index'?: number;
  /** Optional model ID to set as the active/default model for single-model tools. */
  'active-model'?: string;
}

/** A named sync profile containing one or more tool targets. */
export interface SyncProfile {
  /** Unique profile name (required). */
  name: string;
  /** Tool targets for this profile. Empty arrays are allowed (placeholder profiles). */
  targets: SyncProfileTarget[];
}

// --- Available Configs Aggregation ---

/** Masked API key with its index for selection by the sync CLI tool. */
export interface MaskedAPIKey {
  /** Key with all but the last 4 characters replaced by '*'. */
  masked: string;
  /** Position in the server's API key configuration list. */
  index: number;
}

/** A single API provider with its available models. */
export interface SyncProvider {
  /** Provider category (e.g., "openai-compatibility", "claude-api-key"). */
  type: string;
  /** Optional human-readable name (used by openai-compatibility entries). */
  name?: string;
  /** Available model IDs including aliases, with exclusions applied. */
  models: string[];
}

/** An OAuth channel with its alias-transformed model list. */
export interface SyncOAuthChannel {
  /** Channel identifier (e.g., "claude", "codex", "gemini-cli"). */
  channel: string;
  /** Available models after applying aliases and exclusion filters. */
  models: string[];
  /** Number of authenticated accounts contributing to this channel. */
  account_count?: number;
  /** Human-readable label for UI grouping (e.g., "Codex (OAuth)"). */
  display_name?: string;
}

/** Aggregated sync-available configuration response. */
export interface SyncAvailableConfigs {
  /** Server's external URL derived from host, port, and TLS config. */
  base_url: string;
  /** All configured API keys with masking and index. */
  api_keys: MaskedAPIKey[];
  /** All non-disabled provider entries with their available models. */
  providers: SyncProvider[];
  /** OAuth channels with their alias-derived models. */
  oauth_channels: SyncOAuthChannel[];
  /** Deduplicated union of all model names across providers and channels. */
  all_models: string[];
}

// --- Sync State (reported by the aiproxy-sync CLI) ---

/** Per-tool sync outcome reported by a host. */
export type SyncToolReportStatus = 'synced' | 'error' | 'conflict';

/** A single tool's latest sync report from one host. */
export interface SyncToolReport {
  /** Sync tool identifier (e.g., "factory-droid"). */
  tool: string;
  /** Sync outcome. */
  status: SyncToolReportStatus;
  /** When the CLI performed the sync (RFC 3339). */
  timestamp: string;
  /** SHA-256 of the written config, when available. */
  config_hash?: string;
  /** Failure detail when status is not "synced". */
  error?: string;
}

/** Latest sync reports from a single host. */
export interface SyncHostReport {
  /** When the server received the most recent report (RFC 3339). */
  reported_at: string;
  /** Sync profile the host last applied. */
  profile?: string;
  /** Tool ID → latest report. */
  tools: Record<string, SyncToolReport>;
}

/** Response of GET /v0/management/sync/state. */
export interface SyncStateResponse {
  /** Hostname → latest host report. */
  hosts: Record<string, SyncHostReport>;
}
