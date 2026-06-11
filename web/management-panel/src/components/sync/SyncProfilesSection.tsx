/**
 * Sync Profiles section for the Tooling Templates page.
 * Manages profile CRUD (list, create, edit, delete) with sync status display.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { syncApi } from '@/services/api/sync';
import { useNotificationStore } from '@/stores';
import type { SyncProfile, SyncStateResponse, SyncToolReport } from '@/types';
import { SYNC_TOOLS } from './constants';
import { SyncProfileForm } from './SyncProfileForm';
import { SyncStatusIndicator, type SyncStatus } from './SyncStatusIndicator';
import styles from './sync.module.scss';

function toolLabel(t: (key: string, options?: Record<string, unknown>) => string, toolId: string): string {
  const entry = SYNC_TOOLS.find((t) => t.id === toolId);
  return entry ? t(entry.labelKey, { defaultValue: toolId }) : toolId;
}

type FormMode = 'closed' | 'create' | 'edit';

export function SyncProfilesSection() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((s) => s.showNotification);

  const [profiles, setProfiles] = useState<SyncProfile[]>([]);
  const [syncState, setSyncState] = useState<SyncStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formMode, setFormMode] = useState<FormMode>('closed');
  const [editProfile, setEditProfile] = useState<SyncProfile | undefined>(undefined);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ index: number; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await syncApi.getSyncProfiles();
      setProfiles(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }

    // Sync state is best-effort decoration — its absence must not block
    // the profile list.
    try {
      setSyncState(await syncApi.getSyncState());
    } catch {
      setSyncState(null);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const handleCreate = () => {
    setFormMode('create');
    setEditProfile(undefined);
  };

  const handleEdit = (index: number) => {
    setFormMode('edit');
    setEditProfile(profiles[index]);
  };

  const handleFormClose = () => {
    setFormMode('closed');
    setEditProfile(undefined);
  };

  const handleFormSaved = () => {
    setFormMode('closed');
    setEditProfile(undefined);
    fetchProfiles();
  };

  const handleDeleteClick = (index: number) => {
    const profile = profiles[index];
    setDeleteTarget({ index, name: profile.name });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await syncApi.deleteSyncProfile(deleteTarget.name);
      showNotification(
        t('sync_profiles.notifications.deleted', {
          defaultValue: 'Profile "{{name}}" deleted',
          name: deleteTarget.name,
        }),
        'success',
      );
      setDeleteTarget(null);
      fetchProfiles();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showNotification(message || t('sync_profiles.notifications.delete_error', { defaultValue: 'Failed to delete profile' }), 'error');
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteTarget(null);
  };

  const toggleExpand = (index: number) => {
    setExpandedIndex((prev) => (prev === index ? null : index));
  };

  // Resolve a tool's sync status from the most recent report across all
  // hosts that have synced against this server. No report → never synced.
  const getToolStatus = (
    targetTool: string,
  ): { status: SyncStatus; lastSync?: string; errorDetail?: string } => {
    let latest: SyncToolReport | undefined;
    for (const host of Object.values(syncState?.hosts ?? {})) {
      const report = host.tools?.[targetTool];
      if (!report) continue;
      if (!latest || Date.parse(report.timestamp) > Date.parse(latest.timestamp)) {
        latest = report;
      }
    }
    if (!latest) {
      return { status: 'never-synced' };
    }

    const parsed = Date.parse(latest.timestamp);
    const lastSync = Number.isNaN(parsed) ? undefined : new Date(parsed).toLocaleString();
    return { status: latest.status, lastSync, errorDetail: latest.error };
  };

  return (
    <>
      <Card
        title={t('sync_profiles.section_title', { defaultValue: 'Sync Profiles' })}
        extra={
          <Button variant="secondary" size="sm" onClick={handleCreate} disabled={formMode !== 'closed'}>
            {t('sync_profiles.create_button', { defaultValue: '+ Create Profile' })}
          </Button>
        }
      >
        <p className={styles.sectionHint}>
          {t('sync_profiles.section_hint', {
            defaultValue:
              'Sync profiles define which CLI tools to configure and which models/API keys to use. Use ppap-sync CLI to apply profiles.',
          })}
        </p>

        {/* Loading State */}
        {loading && (
          <div className={styles.loadingContainer}>
            <span className="loading-spinner" aria-hidden="true" />
            <span>{t('common.loading', { defaultValue: 'Loading...' })}</span>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className={styles.errorContainer}>
            <span>{t('sync_profiles.load_error', { defaultValue: 'Failed to load sync profiles.' })}</span>
            <button type="button" className={styles.retryButton} onClick={fetchProfiles}>
              {t('common.refresh', { defaultValue: 'Retry' })}
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && profiles.length === 0 && (
          <EmptyState
            title={t('sync_profiles.empty_title', { defaultValue: 'No sync profiles configured' })}
            description={t('sync_profiles.empty_description', {
              defaultValue: 'Create a sync profile to configure CLI tools with models from this proxy.',
            })}
            action={
              <Button variant="primary" size="sm" onClick={handleCreate}>
                {t('sync_profiles.create_first', { defaultValue: 'Create First Profile' })}
              </Button>
            }
          />
        )}

        {/* Profile List */}
        {!loading && !error && profiles.length > 0 && (
          <div className={styles.profileList}>
            {profiles.map((profile, index) => (
              <div key={profile.name}>
                <div className={styles.profileCard}>
                  <div className={styles.profileCardInfo}>
                    <button
                      type="button"
                      className={styles.profileCardName}
                      onClick={() => toggleExpand(index)}
                      aria-expanded={expandedIndex === index}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        font: 'inherit',
                        color: 'inherit',
                        textAlign: 'left',
                      }}
                    >
                      {profile.name}
                      <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-tertiary)' }} aria-hidden="true">
                        {expandedIndex === index ? '▾' : '▸'}
                      </span>
                    </button>
                    <div className={styles.profileCardMeta}>
                      <span className={styles.profileCardMetaItem}>
                        {t('sync_profiles.tool_count', {
                          defaultValue: '{{count}} tool(s)',
                          count: profile.targets?.length ?? 0,
                        })}
                      </span>
                      {profile.targets?.length > 0 && (
                        <span className={styles.profileCardMetaItem}>
                          {profile.targets.map((target) => toolLabel(t, target.tool)).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.profileCardActions}>
                    <Button variant="secondary" size="sm" onClick={() => handleEdit(index)}>
                      {t('common.edit', { defaultValue: 'Edit' })}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleDeleteClick(index)}>
                      {t('common.delete', { defaultValue: 'Delete' })}
                    </Button>
                  </div>
                </div>

                {/* Expanded Profile Detail */}
                {expandedIndex === index && (
                  <div className={styles.profileDetail}>
                    <div className={styles.profileDetailTargets}>
                      {profile.targets?.map((target) => {
                        const { status, lastSync, errorDetail } = getToolStatus(target.tool);
                        return (
                          <div key={target.tool} className={styles.targetDetailRow}>
                            <span className={styles.targetDetailToolLabel}>
                              {toolLabel(t, target.tool)}
                            </span>
                            {target['active-model'] && (
                              <span className={styles.targetDetailModel}>
                                {target['active-model']}
                              </span>
                            )}
                            {target['model-filter'] && (
                              <span className={styles.targetDetailFilter}>
                                /{target['model-filter']}/
                              </span>
                            )}
                            <SyncStatusIndicator status={status} lastSync={lastSync} errorDetail={errorDetail} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        open={formMode !== 'closed'}
        title={
          formMode === 'create'
            ? t('sync_profiles.form.create_title', { defaultValue: 'Create Sync Profile' })
            : t('sync_profiles.form.edit_title', { defaultValue: 'Edit Sync Profile' })
        }
        onClose={handleFormClose}
        width={680}
      >
        <SyncProfileForm
          profile={editProfile}
          onClose={handleFormClose}
          onSaved={handleFormSaved}
        />
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteTarget !== null}
        title={t('sync_profiles.delete.title', { defaultValue: 'Delete Sync Profile' })}
        onClose={handleDeleteCancel}
        width={420}
        footer={
          <>
            <Button variant="secondary" onClick={handleDeleteCancel} disabled={deleteLoading}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button variant="danger" onClick={handleDeleteConfirm} loading={deleteLoading} disabled={deleteLoading}>
              {t('sync_profiles.delete.confirm', { defaultValue: 'Delete' })}
            </Button>
          </>
        }
      >
        <p className={styles.deleteWarning}>
          {t('sync_profiles.delete.message', {
            defaultValue:
              'Are you sure you want to delete the sync profile "{{name}}"? This action cannot be undone.',
            name: deleteTarget?.name ?? '',
          })}
        </p>
      </Modal>
    </>
  );
}
