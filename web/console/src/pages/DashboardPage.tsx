import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SectionPanel } from '@/components/workspace/SectionPanel';
import { WorkspacePage } from '@/components/workspace/WorkspacePage';
import { Badge, Button, EmptyState, Skeleton } from '@/shared/ui';
import { useAuthStore, useConfigStore } from '@/stores';
import {
  useDashboardSnapshot,
  type DashboardPanelState,
} from '@/features/dashboard/useDashboardSnapshot';
import type { UsageEvent } from '@/types';
import styles from './DashboardPage.module.scss';

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatAge(timestamp: number, now: number) {
  if (!timestamp) return '—';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

function PanelState({
  panel,
  loadingLabel,
  emptyTitle,
  emptyDescription,
  errorMessage,
  retryLabel,
  onRetry,
  children,
}: {
  panel: DashboardPanelState<unknown>;
  loadingLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  errorMessage: string;
  retryLabel: string;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (panel.status === 'loading' && !panel.data) {
    return <Skeleton label={loadingLabel} />;
  }
  if (panel.status === 'error' && !panel.data) {
    return (
      <div className={styles.stateBlock} role="alert">
        <p>{errorMessage}</p>
        <Button type="button" onClick={onRetry}>
          {retryLabel}
        </Button>
      </div>
    );
  }
  if (panel.status === 'empty') {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }
  return <>{children}</>;
}

function TrafficTrend({ values, label }: { values: number[]; label: string }) {
  const maximum = Math.max(...values, 1);
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
      const y = 34 - (value / maximum) * 30;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg
      className={styles.trend}
      viewBox="0 0 100 36"
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function FailedRequestRow({ event }: { event: UsageEvent }) {
  return (
    <li className={styles.failedRow}>
      <time dateTime={event.timestamp}>
        {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </time>
      <span>
        {event.provider || '—'} / {event.model || event.alias || '—'}
      </span>
      <code>{event.status_code}</code>
      <code>{Math.round(event.latency_ms)} ms</code>
    </li>
  );
}

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const serverVersion = useAuthStore((state) => state.serverVersion);
  const serverBuildDate = useAuthStore((state) => state.serverBuildDate);
  const config = useConfigStore((state) => state.config);
  const snapshot = useDashboardSnapshot(connectionStatus === 'connected');
  const traffic = snapshot.traffic.data;
  const usage = traffic?.statistics.usage;
  const totalRequests = usage?.total_requests ?? 0;
  const failures = usage?.failure_count ?? traffic?.statistics.failed_requests ?? 0;
  const successes = usage?.success_count ?? Math.max(0, totalRequests - failures);
  const successRate = totalRequests > 0 ? (successes / totalRequests) * 100 : 0;
  const failedEvents = (traffic?.events ?? []).filter((event) => event.failed).slice(0, 5);
  const hourlyValues = Object.values(usage?.requests_by_hour ?? {});
  const updatedAt = Math.max(
    snapshot.traffic.updatedAt ?? 0,
    snapshot.providers.updatedAt ?? 0,
    snapshot.attention.updatedAt ?? 0
  );
  const requiredFailures = (snapshot.attention.data ?? []).filter(
    (item) => item.kind === 'readiness' && item.severity === 'danger'
  ).length;
  const retryPolicy = config?.requestRetry ?? 0;
  const concurrency = config?.upstreamConcurrency?.default;
  const routingStrategy = config?.routingStrategy || '—';
  const now = updatedAt;

  return (
    <WorkspacePage
      eyebrow={t('dashboardOverview.eyebrow')}
      title={t('dashboardOverview.title')}
      description={t('dashboardOverview.description')}
      status={
        <Badge tone={connectionStatus === 'connected' ? 'ok' : 'danger'}>
          {t(`dashboardOverview.connection.${connectionStatus}`)}
        </Badge>
      }
      actions={
        <Button type="button" loading={snapshot.refreshing} onClick={() => void snapshot.refresh()}>
          {t('dashboardOverview.refresh')}
        </Button>
      }
    >
      <div className={styles.meta} aria-label={t('dashboardOverview.serverMeta')}>
        <span>
          <strong>{t('dashboardOverview.version')}</strong> <code>{serverVersion || '—'}</code>
        </span>
        <span>
          <strong>{t('dashboardOverview.build')}</strong> <code>{serverBuildDate || '—'}</code>
        </span>
        <span>
          <strong>{t('dashboardOverview.updated')}</strong>{' '}
          <time>{updatedAt ? new Date(updatedAt).toLocaleTimeString(i18n.language) : '—'}</time>
        </span>
      </div>

      <nav className={styles.signalRail} aria-label={t('dashboardOverview.signals.title')}>
        <Link to="/onboarding">
          <span>{t('dashboardOverview.signals.readiness')}</span>
          <strong>
            {requiredFailures
              ? t('dashboardOverview.signals.failedRequired', { count: requiredFailures })
              : t('dashboardOverview.signals.ready')}
          </strong>
        </Link>
        <Link to="/operations">
          <span>{t('dashboardOverview.signals.requests')}</span>
          <strong>
            {formatNumber(totalRequests)} · {usage?.tps?.toFixed(1) ?? '0.0'} TPS
          </strong>
        </Link>
        <Link to="/usage">
          <span>{t('dashboardOverview.signals.success')}</span>
          <strong>
            {formatPercent(successRate)} ·{' '}
            {t('dashboardOverview.signals.failures', { count: failures })}
          </strong>
        </Link>
        <Link to="/usage">
          <span>{t('dashboardOverview.signals.store')}</span>
          <strong>
            {traffic?.statistics.storage ?? '—'} ·{' '}
            {formatAge(traffic?.usageStatus.newest_ms ?? 0, now)}
          </strong>
        </Link>
      </nav>

      <SectionPanel
        id="traffic-now"
        title={t('dashboardOverview.traffic.title')}
        description={t('dashboardOverview.traffic.description')}
        status={
          snapshot.traffic.error ? (
            <Badge tone="caution">{t('dashboardOverview.partial')}</Badge>
          ) : undefined
        }
      >
        <PanelState
          panel={snapshot.traffic}
          loadingLabel={t('dashboardOverview.traffic.loading')}
          emptyTitle={t('dashboardOverview.traffic.emptyTitle')}
          emptyDescription={t('dashboardOverview.traffic.emptyDescription')}
          errorMessage={
            snapshot.traffic.error === 'connection_required'
              ? t('dashboardOverview.connectionRequired')
              : t('dashboardOverview.traffic.error')
          }
          retryLabel={t('dashboardOverview.retry')}
          onRetry={() => void snapshot.refresh()}
        >
          <div className={styles.trafficGrid} aria-busy={snapshot.refreshing || undefined}>
            <div className={styles.trendPanel}>
              <TrafficTrend
                values={hourlyValues.length ? hourlyValues : [0]}
                label={t('dashboardOverview.traffic.trendLabel')}
              />
            </div>
            <div>
              <h3>{t('dashboardOverview.traffic.latestFailures')}</h3>
              {failedEvents.length ? (
                <ul className={styles.failedList}>
                  {failedEvents.map((event) => (
                    <FailedRequestRow key={event.id} event={event} />
                  ))}
                </ul>
              ) : (
                <p className={styles.clearState}>{t('dashboardOverview.traffic.noFailures')}</p>
              )}
            </div>
          </div>
        </PanelState>
      </SectionPanel>

      <div className={styles.panelGrid}>
        <SectionPanel
          id="provider-readiness"
          title={t('dashboardOverview.providers.title')}
          description={t('dashboardOverview.providers.description')}
          status={
            snapshot.providers.error ? (
              <Badge tone="caution">{t('dashboardOverview.partial')}</Badge>
            ) : undefined
          }
        >
          <PanelState
            panel={snapshot.providers}
            loadingLabel={t('dashboardOverview.providers.loading')}
            emptyTitle={t('dashboardOverview.providers.emptyTitle')}
            emptyDescription={t('dashboardOverview.providers.emptyDescription')}
            errorMessage={
              snapshot.providers.error === 'connection_required'
                ? t('dashboardOverview.connectionRequired')
                : t('dashboardOverview.providers.error')
            }
            retryLabel={t('dashboardOverview.retry')}
            onRetry={() => void snapshot.refresh()}
          >
            <ul className={styles.providerList} aria-busy={snapshot.refreshing || undefined}>
              {(snapshot.providers.data ?? []).map((provider) => (
                <li key={provider.id}>
                  <span>{t(provider.labelKey)}</span>
                  {provider.count === null ? (
                    <Badge tone="danger">{t('dashboardOverview.unavailable')}</Badge>
                  ) : (
                    <strong>{provider.count}</strong>
                  )}
                </li>
              ))}
            </ul>
          </PanelState>
        </SectionPanel>

        <SectionPanel
          id="attention-queue"
          title={t('dashboardOverview.attention.title')}
          description={t('dashboardOverview.attention.description')}
          status={
            snapshot.attention.error ? (
              <Badge tone="caution">{t('dashboardOverview.partial')}</Badge>
            ) : undefined
          }
        >
          <PanelState
            panel={snapshot.attention}
            loadingLabel={t('dashboardOverview.attention.loading')}
            emptyTitle={t('dashboardOverview.attention.emptyTitle')}
            emptyDescription={t('dashboardOverview.attention.emptyDescription')}
            errorMessage={
              snapshot.attention.error === 'connection_required'
                ? t('dashboardOverview.connectionRequired')
                : t('dashboardOverview.attention.error')
            }
            retryLabel={t('dashboardOverview.retry')}
            onRetry={() => void snapshot.refresh()}
          >
            <ul className={styles.attentionList} aria-busy={snapshot.refreshing || undefined}>
              {(snapshot.attention.data ?? []).map((item) => (
                <li key={item.id}>
                  <Badge tone={item.severity}>
                    {t(`dashboardOverview.attention.${item.kind}`)}
                  </Badge>
                  <span>{item.summary}</span>
                  <Link to={item.path}>{t('dashboardOverview.attention.open')}</Link>
                </li>
              ))}
            </ul>
          </PanelState>
        </SectionPanel>
      </div>

      <SectionPanel
        id="configuration-strip"
        title={t('dashboardOverview.configuration.title')}
        actions={<Link to="/config">{t('dashboardOverview.configuration.open')}</Link>}
      >
        <dl className={styles.configurationStrip}>
          <div>
            <dt>{t('dashboardOverview.configuration.routing')}</dt>
            <dd>{routingStrategy}</dd>
          </div>
          <div>
            <dt>{t('dashboardOverview.configuration.retry')}</dt>
            <dd>{retryPolicy}</dd>
          </div>
          <div>
            <dt>{t('dashboardOverview.configuration.logging')}</dt>
            <dd>
              {config?.loggingToFile ? t('dashboardOverview.on') : t('dashboardOverview.off')}
            </dd>
          </div>
          <div>
            <dt>{t('dashboardOverview.configuration.usage')}</dt>
            <dd>
              {config?.usageStatisticsEnabled
                ? t('dashboardOverview.on')
                : t('dashboardOverview.off')}
            </dd>
          </div>
          <div>
            <dt>{t('dashboardOverview.configuration.concurrency')}</dt>
            <dd>
              {concurrency && concurrency > 0
                ? concurrency
                : t('dashboardOverview.configuration.unlimited')}
            </dd>
          </div>
        </dl>
      </SectionPanel>
    </WorkspacePage>
  );
}
