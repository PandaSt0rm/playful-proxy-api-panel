import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SectionPanel } from '@/components/workspace/SectionPanel';
import { WorkspacePage } from '@/components/workspace/WorkspacePage';
import { Badge, Button, Drawer, EmptyState, Skeleton } from '@/shared/ui';
import {
  useOperationsFeed,
  type OperationsFilters,
  type PanelState,
} from '@/features/operations/useOperationsFeed';
import type { UsageEvent } from '@/types';
import styles from './OperatorPages.module.scss';

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function PanelContent({
  panel,
  emptyTitle,
  emptyDescription,
  errorText,
  retry,
  children,
}: {
  panel: PanelState<unknown>;
  emptyTitle: string;
  emptyDescription: string;
  errorText: string;
  retry: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  if (panel.status === 'loading' && !panel.data) return <Skeleton label={emptyTitle} />;
  if (panel.status === 'error' && !panel.data) {
    return (
      <div className={styles.stateBlock} role="alert">
        <p>{errorText}</p>
        <Button type="button" onClick={retry}>
          {t('operations.retry')}
        </Button>
      </div>
    );
  }
  if (panel.status === 'empty')
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return <>{children}</>;
}

function parseLogLine(line: string) {
  const match = line.match(/^\s*(\S+\s+\S+)\s+\[?(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\]?\s*(.*)$/i);
  return match
    ? { timestamp: match[1], level: match[2].toUpperCase(), message: match[3] }
    : { timestamp: '', level: '', message: line };
}

function RequestDetails({ event }: { event: UsageEvent }) {
  const { t } = useTranslation();
  return (
    <dl className={styles.detailGrid}>
      <div>
        <dt>{t('operations.details.requestId')}</dt>
        <dd>
          <code>{event.request_id || '—'}</code>
        </dd>
      </div>
      <div>
        <dt>{t('operations.details.eventId')}</dt>
        <dd>
          <code>{event.event_hash}</code>
        </dd>
      </div>
      <div>
        <dt>{t('operations.details.path')}</dt>
        <dd>
          <code>
            {event.method} {event.path}
          </code>
        </dd>
      </div>
      <div>
        <dt>{t('operations.details.auth')}</dt>
        <dd>
          <code>
            {event.auth_type} · {event.auth_index}
          </code>
        </dd>
      </div>
      <div>
        <dt>{t('operations.details.source')}</dt>
        <dd>
          <code>{event.api_key_alias || event.source_hash || event.source || '—'}</code>
        </dd>
      </div>
      <div>
        <dt>{t('operations.details.tokens')}</dt>
        <dd>
          <code>
            {event.tokens.input_tokens} / {event.tokens.output_tokens} / {event.tokens.total_tokens}
          </code>
        </dd>
      </div>
      <div>
        <dt>{t('operations.details.timestamps')}</dt>
        <dd>
          <code>{event.timestamp}</code>
        </dd>
      </div>
      <div>
        <dt>{t('operations.details.latency')}</dt>
        <dd>
          <code>
            {event.latency_ms} ms / {event.first_byte_latency_ms} ms
          </code>
        </dd>
      </div>
      {event.failure_body && (
        <div className={styles.detailWide}>
          <dt>{t('operations.details.failure')}</dt>
          <dd>
            <pre>
              <code>{event.failure_body}</code>
            </pre>
          </dd>
        </div>
      )}
    </dl>
  );
}

export function OperationsPage() {
  const { t } = useTranslation();
  const feed = useOperationsFeed();
  const [selectedEvent, setSelectedEvent] = useState<UsageEvent | null>(null);
  const [rawLogs, setRawLogs] = useState(false);
  const [followLogs, setFollowLogs] = useState(true);
  const logViewportRef = useRef<HTMLDivElement | null>(null);
  const usage = feed.traffic.data?.usage;
  const degraded = [feed.traffic, feed.routes, feed.events, feed.logs].some(
    (panel) => panel.status === 'error'
  );
  const latestUpdate = Math.max(
    feed.traffic.updatedAt ?? 0,
    feed.routes.updatedAt ?? 0,
    feed.events.updatedAt ?? 0,
    feed.logs.updatedAt ?? 0
  );
  const pageState = feed.paused || feed.cadence === 0 ? 'paused' : degraded ? 'degraded' : 'live';
  const providerOptions = useMemo(
    () => [
      { value: '', label: t('operations.filters.allProviders') },
      ...(feed.routes.data ?? []).map((row) => ({ value: row.key, label: row.label || row.key })),
    ],
    [feed.routes.data, t]
  );

  useEffect(() => {
    if (!followLogs || !logViewportRef.current) return;
    logViewportRef.current.scrollTop = logViewportRef.current.scrollHeight;
  }, [feed.logs.data?.lines, followLogs]);

  const updateFilter = <K extends keyof OperationsFilters>(key: K, value: OperationsFilters[K]) => {
    feed.setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <WorkspacePage
      eyebrow={t('operations.eyebrow')}
      title={t('operations.title')}
      description={t('operations.description')}
      status={
        <Badge tone={pageState === 'live' ? 'ok' : pageState === 'degraded' ? 'danger' : 'caution'}>
          {t(`operations.state.${pageState}`)}
        </Badge>
      }
      actions={
        <div className={styles.toolbar}>
          <span className={styles.freshness}>
            {latestUpdate
              ? t('operations.updated', { time: new Date(latestUpdate).toLocaleTimeString() })
              : t('operations.waiting')}
          </span>
          <Select
            value={String(feed.cadence)}
            ariaLabel={t('operations.cadence.label')}
            options={[
              { value: '0', label: t('operations.cadence.off') },
              { value: '8000', label: t('operations.cadence.eight') },
              { value: '15000', label: t('operations.cadence.fifteen') },
              { value: '30000', label: t('operations.cadence.thirty') },
            ]}
            onChange={(value) => feed.setCadence(Number(value) as 0 | 8000 | 15000 | 30000)}
          />
          <Button type="button" onClick={() => feed.setPaused(!feed.paused)}>
            {feed.paused ? t('operations.resume') : t('operations.pause')}
          </Button>
          <Button type="button" loading={feed.refreshing} onClick={() => void feed.refresh()}>
            {t('operations.refresh')}
          </Button>
        </div>
      }
    >
      <div className={styles.signalRail}>
        <div>
          <span>{t('operations.signals.requests')}</span>
          <strong>{formatNumber(usage?.total_requests ?? 0)}</strong>
        </div>
        <div>
          <span>{t('operations.signals.results')}</span>
          <strong>
            {usage?.success_count ?? 0} / {usage?.failure_count ?? 0}
          </strong>
        </div>
        <div>
          <span>{t('operations.signals.latency')}</span>
          <strong>
            {Math.round(usage?.average_latency_ms ?? 0)} /{' '}
            {Math.round(usage?.average_first_byte_latency_ms ?? 0)} ms
          </strong>
        </div>
        <div>
          <span>{t('operations.signals.throughput')}</span>
          <strong>
            {usage?.tps?.toFixed(1) ?? '0.0'} TPS · {formatNumber(usage?.total_tokens ?? 0)}
          </strong>
        </div>
      </div>

      <div className={styles.operationsSplit}>
        <SectionPanel
          id="provider-routes"
          title={t('operations.routes.title')}
          description={t('operations.routes.description')}
          status={
            feed.routes.error ? <Badge tone="danger">{t('operations.error')}</Badge> : undefined
          }
        >
          <PanelContent
            panel={feed.routes}
            emptyTitle={t('operations.routes.emptyTitle')}
            emptyDescription={t('operations.routes.emptyDescription')}
            errorText={t('operations.routes.error')}
            retry={() => void feed.refresh()}
          >
            <ul className={styles.routeRows}>
              {(feed.routes.data ?? []).map((route) => {
                const share = usage?.total_requests
                  ? (route.requests / usage.total_requests) * 100
                  : 0;
                return (
                  <li key={route.key}>
                    <button
                      type="button"
                      aria-pressed={feed.filters.provider === route.key}
                      onClick={() => updateFilter('provider', route.key)}
                    >
                      <strong>{route.label || route.key}</strong>
                      <span>
                        {route.requests} · {share.toFixed(1)}%
                      </span>
                      <span>
                        {route.successes}/{route.failures} · {Math.round(route.average_latency_ms)}{' '}
                        ms
                      </span>
                      <time>
                        {route.last_seen_ms
                          ? new Date(route.last_seen_ms).toLocaleTimeString()
                          : '—'}
                      </time>
                    </button>
                  </li>
                );
              })}
            </ul>
          </PanelContent>
        </SectionPanel>

        <SectionPanel
          id="request-activity"
          title={t('operations.requests.title')}
          description={t('operations.requests.description')}
          status={
            feed.events.error ? <Badge tone="danger">{t('operations.error')}</Badge> : undefined
          }
        >
          <div className={styles.fieldGrid}>
            <Input
              aria-label={t('operations.filters.search')}
              placeholder={t('operations.filters.search')}
              value={feed.filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
            />
            <Select
              ariaLabel={t('operations.filters.provider')}
              value={feed.filters.provider}
              options={providerOptions}
              onChange={(value) => updateFilter('provider', value)}
            />
            <Input
              aria-label={t('operations.filters.model')}
              placeholder={t('operations.filters.model')}
              value={feed.filters.model}
              onChange={(event) => updateFilter('model', event.target.value)}
            />
            <Input
              aria-label={t('operations.filters.endpoint')}
              placeholder={t('operations.filters.endpoint')}
              value={feed.filters.endpoint}
              onChange={(event) => updateFilter('endpoint', event.target.value)}
            />
            <Select
              ariaLabel={t('operations.filters.status')}
              value={feed.filters.status}
              options={[
                { value: 'all', label: t('operations.filters.all') },
                { value: 'success', label: t('operations.filters.success') },
                { value: 'failed', label: t('operations.filters.failed') },
              ]}
              onChange={(value) => updateFilter('status', value as OperationsFilters['status'])}
            />
          </div>
          <PanelContent
            panel={feed.events}
            emptyTitle={t('operations.requests.emptyTitle')}
            emptyDescription={t('operations.requests.emptyDescription')}
            errorText={t('operations.requests.error')}
            retry={() => void feed.refresh()}
          >
            <div className={styles.tableViewport}>
              <table>
                <thead>
                  <tr>
                    <th>{t('operations.columns.time')}</th>
                    <th>{t('operations.columns.result')}</th>
                    <th>{t('operations.columns.provider')}</th>
                    <th>{t('operations.columns.model')}</th>
                    <th>{t('operations.columns.endpoint')}</th>
                    <th>{t('operations.columns.source')}</th>
                    <th>{t('operations.columns.tokens')}</th>
                    <th>{t('operations.columns.latency')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(feed.events.data ?? []).map((item) => (
                    <tr key={item.id}>
                      <td>
                        <button
                          type="button"
                          className={styles.rowTrigger}
                          onClick={() => setSelectedEvent(item)}
                        >
                          {formatTime(item.timestamp)}
                        </button>
                      </td>
                      <td>
                        <Badge tone={item.failed ? 'danger' : 'ok'}>{item.status_code}</Badge>
                      </td>
                      <td>{item.provider}</td>
                      <td>{item.model || item.alias}</td>
                      <td>
                        <code>
                          {item.method} {item.endpoint}
                        </code>
                      </td>
                      <td>{item.api_key_alias || item.auth_index}</td>
                      <td>{item.tokens.total_tokens}</td>
                      <td>
                        {Math.round(item.latency_ms)} / {Math.round(item.first_byte_latency_ms)} ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PanelContent>
        </SectionPanel>
      </div>

      <SectionPanel
        id="application-log"
        title={t('operations.logs.title')}
        description={t('operations.logs.description')}
        status={feed.logs.error ? <Badge tone="danger">{t('operations.error')}</Badge> : undefined}
        actions={
          <div className={styles.toolbar}>
            <Button type="button" aria-pressed={rawLogs} onClick={() => setRawLogs(!rawLogs)}>
              {rawLogs ? t('operations.logs.parsed') : t('operations.logs.raw')}
            </Button>
            <Button
              type="button"
              aria-pressed={followLogs}
              onClick={() => setFollowLogs(!followLogs)}
            >
              {t('operations.logs.follow')}
            </Button>
            <Link to="/logs">{t('operations.logs.open')}</Link>
          </div>
        }
      >
        <PanelContent
          panel={feed.logs}
          emptyTitle={t('operations.logs.emptyTitle')}
          emptyDescription={t('operations.logs.emptyDescription')}
          errorText={t('operations.logs.error')}
          retry={() => void feed.refresh()}
        >
          <div ref={logViewportRef} className={styles.logViewport}>
            {(feed.logs.data?.lines ?? []).map((line, index) =>
              rawLogs ? (
                <code key={`${index}-${line}`}>{line}</code>
              ) : (
                (() => {
                  const parsed = parseLogLine(line);
                  return (
                    <div key={`${index}-${line}`}>
                      <time>{parsed.timestamp}</time>
                      <strong>{parsed.level}</strong>
                      <span>{parsed.message}</span>
                    </div>
                  );
                })()
              )
            )}
          </div>
        </PanelContent>
      </SectionPanel>

      <Drawer
        open={Boolean(selectedEvent)}
        title={t('operations.details.title')}
        onClose={() => setSelectedEvent(null)}
      >
        {selectedEvent && <RequestDetails event={selectedEvent} />}
      </Drawer>
    </WorkspacePage>
  );
}
