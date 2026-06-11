/**
 * Sync profile API methods for the PPAPI config sync system.
 * Follows existing patterns from providers.ts and config.ts.
 */

import { apiClient } from './client';
import type {
  SyncProfile,
  SyncProfileTarget,
  SyncAvailableConfigs,
  SyncStateResponse
} from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Extract the profiles array from the GET response wrapper. */
const extractProfiles = (data: unknown): SyncProfile[] => {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return [];
  const candidate = data['sync-profiles'] ?? data.syncProfiles ?? data.data ?? data;
  return Array.isArray(candidate) ? candidate : [];
};

/** Serialize a single profile target, omitting empty optional fields. */
const serializeTarget = (target: SyncProfileTarget): Record<string, unknown> => {
  const payload: Record<string, unknown> = { tool: target.tool };
  if (target['model-filter']?.trim()) {
    payload['model-filter'] = target['model-filter'].trim();
  }
  if (target['api-key-index'] !== undefined && target['api-key-index'] !== null) {
    payload['api-key-index'] = target['api-key-index'];
  }
  if (target['active-model']?.trim()) {
    payload['active-model'] = target['active-model'].trim();
  }
  return payload;
};

/** Serialize a full sync profile for PUT/PATCH payloads. */
const serializeProfile = (profile: SyncProfile): Record<string, unknown> => ({
  name: profile.name,
  targets: Array.isArray(profile.targets) ? profile.targets.map(serializeTarget) : []
});

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export const syncApi = {
  /**
   * Fetch all sync profiles.
   * GET /v0/management/sync-profiles → {"sync-profiles": [...]}
   */
  async getSyncProfiles(): Promise<SyncProfile[]> {
    const data = await apiClient.get('/sync-profiles');
    return extractProfiles(data);
  },

  /**
   * Replace the entire sync profiles list (full replacement).
   * PUT /v0/management/sync-profiles → {"status": "ok"}
   */
  saveSyncProfiles(profiles: SyncProfile[]): Promise<{ status: string }> {
    return apiClient.put('/sync-profiles', {
      'sync-profiles': profiles.map(serializeProfile)
    });
  },

  /**
   * Update a single profile by name match (partial update).
   * PATCH /v0/management/sync-profiles with {match, value} → {"status": "ok"}
   *
   * Only the fields present on `value` are sent — the server applies a
   * `targets` key as a full replacement, so a rename-only update must not
   * include an empty targets array.
   */
  updateSyncProfileByName(
    name: string,
    value: Partial<SyncProfile>
  ): Promise<{ status: string }> {
    const patchValue: Record<string, unknown> = {};
    if (value.name !== undefined) {
      patchValue.name = value.name;
    }
    if (value.targets !== undefined) {
      patchValue.targets = value.targets.map(serializeTarget);
    }
    const payload: Record<string, unknown> = {
      match: name,
      value: Object.keys(patchValue).length > 0 ? patchValue : value
    };
    return apiClient.patch('/sync-profiles', payload);
  },

  /**
   * Delete a profile by name or index.
   * DELETE /v0/management/sync-profiles?name=... or ?index=N → {"status": "ok"}
   */
  deleteSyncProfile(nameOrIndex: string | number): Promise<{ status: string }> {
    if (typeof nameOrIndex === 'number') {
      return apiClient.delete(`/sync-profiles?index=${encodeURIComponent(nameOrIndex)}`);
    }
    return apiClient.delete(`/sync-profiles?name=${encodeURIComponent(nameOrIndex)}`);
  },

  /**
   * Fetch aggregated sync-available configuration.
   * GET /v0/management/sync/available-configs → SyncAvailableConfigs
   */
  async getSyncAvailableConfigs(): Promise<SyncAvailableConfigs> {
    return apiClient.get('/sync/available-configs');
  },

  /**
   * Fetch per-host sync status reported by ppap-sync CLIs.
   * GET /v0/management/sync/state → {"hosts": {...}}
   */
  async getSyncState(): Promise<SyncStateResponse> {
    const data = await apiClient.get('/sync/state');
    if (isRecord(data) && isRecord(data.hosts)) {
      return data as unknown as SyncStateResponse;
    }
    return { hosts: {} };
  }
};
