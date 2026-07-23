import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { aiproxyApi, type Revision, type RevisionDetail } from '@/services/api/aiproxy';
import { Input } from '@/components/ui/Input';
import { SectionPanel } from '@/components/workspace/SectionPanel';
import { WorkspacePage } from '@/components/workspace/WorkspacePage';
import {
  Badge,
  Button,
  ConfirmationDialog,
  DiffView,
  Drawer,
  EmptyState,
  Skeleton,
} from '@/shared/ui';
import styles from './OperatorPages.module.scss';

function errorStatus(error: unknown) {
  if (!error || typeof error !== 'object' || !('status' in error)) return 500;
  return typeof error.status === 'number' ? error.status : 500;
}

export function ChangesPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Revision[]>([]);
  const [current, setCurrent] = useState('');
  const [selected, setSelected] = useState<RevisionDetail | null>(null);
  const [restore, setRestore] = useState<RevisionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [inspecting, setInspecting] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filter, setFilter] = useState('');
  const [compactInspector, setCompactInspector] = useState(
    () => window.matchMedia('(max-width: 1100px)').matches
  );

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await aiproxyApi.revisions();
      setItems(response.revisions);
      setCurrent(response.current_sha256);
    } catch {
      setError('load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1100px)');
    const update = () => setCompactInspector(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const inspect = async (item: Revision) => {
    setInspecting(true);
    setError('');
    try {
      setSelected(await aiproxyApi.revision(item.id));
    } catch (error) {
      setError(errorStatus(error) === 404 ? 'notFound' : 'inspect');
    } finally {
      setInspecting(false);
    }
  };

  const confirmRestore = async () => {
    if (!restore) return;
    setPending(true);
    setError('');
    setSuccess('');
    try {
      await aiproxyApi.restore(restore.id, current);
      setRestore(null);
      setSelected(null);
      setSuccess('restored');
      await load();
    } catch (error) {
      const status = errorStatus(error);
      setError(status === 404 ? 'notFound' : status === 409 ? 'conflict' : 'restore');
    } finally {
      setPending(false);
    }
  };

  const visibleItems = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) =>
      [item.action, item.management_path, item.actor_ip, item.id, item.after_sha256].some((value) =>
        value.toLowerCase().includes(query)
      )
    );
  }, [filter, items]);

  const inspector = selected ? (
    <div className={styles.revisionInspector}>
      <dl className={styles.detailGrid}>
        <div>
          <dt>{t('changes.revision')}</dt>
          <dd>
            <code>{selected.id}</code>
          </dd>
        </div>
        <div>
          <dt>{t('changes.after')}</dt>
          <dd>
            <code>{selected.after_sha256}</code>
          </dd>
        </div>
        <div>
          <dt>{t('changes.actor')}</dt>
          <dd>
            <code>{selected.actor_ip}</code>
          </dd>
        </div>
        <div>
          <dt>{t('changes.path')}</dt>
          <dd>
            <code>{selected.management_path}</code>
          </dd>
        </div>
      </dl>
      <DiffView diff={selected.diff} />
      <Button type="button" onClick={() => setRestore(selected)}>
        {t('changes.restore')}
      </Button>
    </div>
  ) : (
    <EmptyState title={t('changes.selectTitle')} description={t('changes.selectDescription')} />
  );

  return (
    <WorkspacePage
      eyebrow={t('changes.eyebrow')}
      title={t('changes.title')}
      description={t('changes.description')}
      actions={
        <Button type="button" loading={loading} onClick={() => void load()}>
          {t('changes.refresh')}
        </Button>
      }
    >
      {error && (
        <div className={styles.stateBlock} role="alert">
          <p>{t(`changes.errors.${error}`)}</p>
          <Button type="button" onClick={() => void load()}>
            {t('changes.retry')}
          </Button>
        </div>
      )}
      {success && <p role="status">{t('changes.restored')}</p>}
      {loading && items.length === 0 ? (
        <Skeleton label={t('changes.loading')} />
      ) : items.length === 0 ? (
        <EmptyState title={t('changes.emptyTitle')} description={t('changes.emptyDescription')} />
      ) : (
        <div className={styles.changesWorkbench}>
          <SectionPanel
            id="revision-list"
            title={t('changes.revisions')}
            actions={
              <Input
                aria-label={t('changes.filter')}
                placeholder={t('changes.filter')}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            }
          >
            <div className={styles.tableViewport}>
              <table>
                <thead>
                  <tr>
                    <th>{t('changes.time')}</th>
                    <th>{t('changes.action')}</th>
                    <th>{t('changes.path')}</th>
                    <th>{t('changes.actor')}</th>
                    <th>{t('changes.sha')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => (
                    <tr
                      key={item.id}
                      className={selected?.id === item.id ? styles.selectedRow : undefined}
                    >
                      <td>
                        <button
                          type="button"
                          className={styles.rowTrigger}
                          onClick={() => void inspect(item)}
                        >
                          {new Date(item.created_at).toLocaleString()}
                        </button>
                      </td>
                      <td>
                        <Badge>{item.action}</Badge>
                      </td>
                      <td>
                        <code>{item.management_path}</code>
                      </td>
                      <td>
                        <code>{item.actor_ip}</code>
                      </td>
                      <td>
                        <code>{item.after_sha256.slice(0, 12)}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionPanel>
          {!compactInspector && (
            <SectionPanel
              id="revision-inspector"
              title={t('changes.inspector')}
              status={inspecting ? <Badge tone="info">{t('changes.loading')}</Badge> : undefined}
            >
              {inspector}
            </SectionPanel>
          )}
        </div>
      )}
      {compactInspector && (
        <Drawer
          open={selected !== null}
          title={t('changes.inspector')}
          onClose={() => setSelected(null)}
        >
          {inspector}
        </Drawer>
      )}
      <ConfirmationDialog
        open={restore !== null}
        title={t('changes.confirm.title')}
        pending={pending}
        cancelLabel={t('changes.confirm.cancel')}
        confirmLabel={t('changes.confirm.submit')}
        onClose={() => setRestore(null)}
        onConfirm={() => void confirmRestore()}
      >
        <p>{t('changes.confirm.body')}</p>
        <code>{current}</code>
      </ConfirmationDialog>
    </WorkspacePage>
  );
}
