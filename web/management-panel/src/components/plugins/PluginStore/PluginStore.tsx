import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useNotificationStore } from '@/stores';
import { pluginStoreApi } from '@/services/api/pluginStore';
import type { PluginStoreEntry, PluginStoreListResponse } from '@/types/pluginStore';
import styles from './PluginStore.module.scss';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '';
};

interface PluginStoreProps {
  /** Called after a successful install so the parent can refresh its installed-plugin list. */
  onChanged?: () => void;
}

export function PluginStore({ onChanged }: PluginStoreProps) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const [data, setData] = useState<PluginStoreListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [installingId, setInstallingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await pluginStoreApi.list());
    } catch (err: unknown) {
      setError(
        getErrorMessage(err) ||
          t('plugins.store.load_failed', { defaultValue: 'Failed to load the plugin store.' })
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleInstall = useCallback(
    async (entry: PluginStoreEntry) => {
      setInstallingId(entry.store_id || entry.id);
      try {
        const result = await pluginStoreApi.install(entry.id, entry.source_id);
        showNotification(
          result.restart_required
            ? t('plugins.store.install_restart', {
                defaultValue: 'Plugin "{{id}}" installed. Restart the server to load it.',
                id: entry.id,
              })
            : t('plugins.store.install_success', {
                defaultValue: 'Plugin "{{id}}" installed.',
                id: entry.id,
              }),
          'success'
        );
        await load();
        onChanged?.();
      } catch (err: unknown) {
        showNotification(
          getErrorMessage(err) ||
            t('plugins.store.install_failed', { defaultValue: 'Failed to install plugin.' }),
          'error'
        );
      } finally {
        setInstallingId(null);
      }
    },
    [load, onChanged, showNotification, t]
  );

  const entries = useMemo(() => data?.plugins ?? [], [data]);
  const sourceErrors = useMemo(() => data?.source_errors ?? [], [data]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter((entry) =>
      [entry.name, entry.id, entry.description, entry.author, ...entry.tags]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [entries, search]);

  const renderAction = (entry: PluginStoreEntry) => {
    const busy = installingId === (entry.store_id || entry.id);
    if (!entry.installed) {
      return (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void handleInstall(entry)}
          loading={busy}
        >
          {t('plugins.store.install', { defaultValue: 'Install' })}
        </Button>
      );
    }
    if (entry.update_available) {
      return (
        <>
          <span className={styles.installedBadge}>
            {t('plugins.store.installed_version', {
              defaultValue: 'v{{version}} installed',
              version: entry.installed_version || '?',
            })}
          </span>
          <Button size="sm" onClick={() => void handleInstall(entry)} loading={busy}>
            {t('plugins.store.update', { defaultValue: 'Update' })}
          </Button>
        </>
      );
    }
    return (
      <span className={styles.installedBadge}>
        {t('plugins.store.installed', { defaultValue: 'Installed' })}
      </span>
    );
  };

  return (
    <Card className={styles.storeCard}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>
            {t('plugins.store.title', { defaultValue: 'Plugin store' })}
          </div>
          <div className={styles.subtitle}>
            {t('plugins.store.subtitle', {
              defaultValue: 'Browse and install plugins from configured registries.',
            })}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
          {t('common.refresh', { defaultValue: 'Refresh' })}
        </Button>
      </div>

      {sourceErrors.length > 0 ? (
        <div className={styles.sourceErrors} role="alert">
          {sourceErrors.map((srcErr) => (
            <div key={srcErr.source_id || srcErr.source_url} className={styles.sourceError}>
              {t('plugins.store.source_error', {
                defaultValue: '{{name}}: {{message}}',
                name: srcErr.source_name || srcErr.source_url,
                message: srcErr.message,
              })}
            </div>
          ))}
        </div>
      ) : null}

      {entries.length > 0 ? (
        <Input
          type="search"
          placeholder={t('plugins.store.search_placeholder', { defaultValue: 'Search plugins…' })}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('plugins.store.search_placeholder', { defaultValue: 'Search plugins…' })}
        />
      ) : null}

      {loading ? (
        <div className={styles.loading}>
          <LoadingSpinner />
        </div>
      ) : error ? (
        <div className={styles.errorState}>
          <p>{error}</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            {t('common.retry', { defaultValue: 'Retry' })}
          </Button>
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          title={t('plugins.store.empty_title', { defaultValue: 'No plugins available' })}
          description={t('plugins.store.empty_desc', {
            defaultValue:
              'No plugins were found in the configured registries. Add a registry via plugins.store-sources in the config editor.',
          })}
        />
      ) : filtered.length === 0 ? (
        <EmptyState title={t('plugins.store.no_matches', { defaultValue: 'No matching plugins' })} />
      ) : (
        <div className={styles.list} data-testid="plugin-store-list">
          {filtered.map((entry) => (
            <div key={entry.store_id || entry.id} className={styles.row}>
              <div className={styles.identity}>
                {entry.logo ? (
                  <img className={styles.logo} src={entry.logo} alt="" aria-hidden />
                ) : (
                  <div className={styles.logoFallback} aria-hidden>
                    {(entry.name || entry.id).slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className={styles.identityText}>
                  <div className={styles.name}>
                    {entry.name || entry.id}
                    {entry.version ? <span className={styles.version}>v{entry.version}</span> : null}
                  </div>
                  {entry.description ? (
                    <div className={styles.description}>{entry.description}</div>
                  ) : null}
                  <div className={styles.meta}>
                    <code>{entry.id}</code>
                    {entry.source_name ? <span>{entry.source_name}</span> : null}
                    {entry.author ? <span>{entry.author}</span> : null}
                    {entry.tags.map((tag) => (
                      <span key={tag} className={styles.tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className={styles.actions}>{renderAction(entry)}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
