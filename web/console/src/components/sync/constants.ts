/**
 * Constants for the sync profiles UI.
 */

export const SYNC_TOOLS = [
  { id: 'factory-droid', labelKey: 'sync_profiles.tools.factory_droid' },
  { id: 'opencode', labelKey: 'sync_profiles.tools.opencode' },
  { id: 'claude-code', labelKey: 'sync_profiles.tools.claude_code' },
  { id: 'codex', labelKey: 'sync_profiles.tools.codex' },
  { id: 'cursor', labelKey: 'sync_profiles.tools.cursor' },
  { id: 'continue', labelKey: 'sync_profiles.tools.continue' },
  { id: 'aider', labelKey: 'sync_profiles.tools.aider' },
  { id: 'forgecode', labelKey: 'sync_profiles.tools.forgecode' },
  { id: 'hermes', labelKey: 'sync_profiles.tools.hermes' },
] as const;

export type SyncToolId = (typeof SYNC_TOOLS)[number]['id'];
