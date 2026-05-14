/**
 * Sync profile API methods for the PPAPI config sync system.
 * Follows existing patterns from providers.ts and config.ts.
 */

import { apiClient } from './client';
import type {
  SyncProfile,
  SyncProfileTarget,
  SyncAvailableConfigs
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
   * Update a single profile by index (partial update).
   * PATCH /v0/management/sync-profiles with {index, value} → {"status": "ok"}
   */
  updateSyncProfile(index: number, value: Partial<SyncProfile>): Promise<{ status: string }> {
    const payload: Record<string, unknown> = { index };
    // Only serialize fields that are actually provided (partial update).
    if (value.name !== undefined) {
      payload.value = serializeProfile(value as SyncProfile);
    } else if (value.targets !== undefined) {
      payload.value = { targets: value.targets.map(serializeTarget) };
    } else {
      // Allow raw partial value passthrough for arbitrary field updates.
      payload.value = value;
    }
    return apiClient.patch('/sync-profiles', payload);
  },

  /**
   * Update a single profile by name match (partial update).
   * PATCH /v0/management/sync-profiles with {match, value} → {"status": "ok"}
   */
  updateSyncProfileByName(
    name: string,
    value: Partial<SyncProfile>
  ): Promise<{ status: string }> {
    const payload: Record<string, unknown> = { match: name };
    if (value.name !== undefined || value.targets !== undefined) {
      payload.value = serializeProfile(value as SyncProfile);
    } else {
      payload.value = value;
    }
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
  }
};
