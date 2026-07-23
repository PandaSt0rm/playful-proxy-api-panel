import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { aiproxyApi, type Readiness } from '@/services/api/aiproxy';
import { SectionPanel } from '@/components/workspace/SectionPanel';
import { WorkspacePage } from '@/components/workspace/WorkspacePage';
import { Badge, Button, Skeleton } from '@/shared/ui';
import styles from './OperatorPages.module.scss';

export function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState<Readiness | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    setPending(true);
    setError('');
    try {
      setData(await aiproxyApi.readiness());
    } catch {
      setError('error');
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (data?.status !== 'ready') return;
    const timer = window.setTimeout(() => navigate('/', { replace: true }), 700);
    return () => window.clearTimeout(timer);
  }, [data?.status, navigate]);

  const orderedChecks = useMemo(() => {
    const rank = (check: Readiness['checks'][number]) =>
      check.status === 'fail' && check.required
        ? 0
        : check.status === 'warn' || check.status === 'fail'
          ? 1
          : 2;
    return [...(data?.checks ?? [])].sort((left, right) => rank(left) - rank(right));
  }, [data?.checks]);
  const actionable = orderedChecks.filter((check) => check.status !== 'pass');
  const passed = orderedChecks.filter((check) => check.status === 'pass');

  return (
    <WorkspacePage
      eyebrow={t('readiness.eyebrow')}
      title={t('readiness.title')}
      description={t('readiness.description')}
      status={
        data ? (
          <Badge
            tone={data.status === 'ready' ? 'ok' : data.status === 'blocked' ? 'danger' : 'caution'}
          >
            {t(`readiness.status.${data.status}`)}
          </Badge>
        ) : undefined
      }
      actions={
        <Button type="button" loading={pending} onClick={() => void load()}>
          {t('readiness.refresh')}
        </Button>
      }
      width="reading"
    >
      {!data && !error && <Skeleton label={t('readiness.loading')} />}
      {error && (
        <div className={styles.stateBlock} role="alert">
          <p>{t('readiness.error')}</p>
          <Button type="button" onClick={() => void load()}>
            {t('readiness.retry')}
          </Button>
        </div>
      )}
      {data?.status === 'ready' && (
        <SectionPanel id="readiness-complete" title={t('readiness.readyTitle')}>
          <p>{t('readiness.readyDescription')}</p>
          <Link to="/">{t('readiness.continue')}</Link>
        </SectionPanel>
      )}
      {data && data.status !== 'ready' && (
        <SectionPanel id="readiness-checks" title={t('readiness.checksTitle')}>
          <ul className={styles.readinessList}>
            {actionable.map((check) => (
              <li key={check.id}>
                <Badge tone={check.status === 'fail' ? 'danger' : 'caution'}>
                  {t(`readiness.checkStatus.${check.status}`)}
                </Badge>
                <div>
                  <strong>{check.id}</strong>
                  <p>{check.summary}</p>
                </div>
                {check.action_path && <Link to={check.action_path}>{t('readiness.open')}</Link>}
              </li>
            ))}
          </ul>
          {passed.length > 0 && (
            <details className={styles.passedChecks}>
              <summary>{t('readiness.passed', { count: passed.length })}</summary>
              <ul>
                {passed.map((check) => (
                  <li key={check.id}>
                    <Badge tone="ok">{t('readiness.checkStatus.pass')}</Badge>
                    <span>{check.summary}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </SectionPanel>
      )}
    </WorkspacePage>
  );
}
