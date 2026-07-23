import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { logsApi } from '@/services/api/logs';
import { usageApi } from '@/services/api/usage';
import type { UsageEvent, UsageStatisticsResponse, UsageSummaryRow } from '@/types';

export type OperationsCadenceMs = 0 | 8000 | 15000 | 30000;

export interface OperationsFilters {
  search: string;
  provider: string;
  model: string;
  endpoint: string;
  status: 'all' | 'success' | 'failed';
}

export interface PanelState<T> {
  status: 'loading' | 'ready' | 'empty' | 'error';
  data: T | null;
  error: string;
  updatedAt: number | null;
}

export interface OperationsLogState {
  lines: string[];
  latestTimestamp: number;
}

interface OperationsFeed {
  traffic: PanelState<UsageStatisticsResponse>;
  routes: PanelState<UsageSummaryRow[]>;
  events: PanelState<UsageEvent[]>;
  logs: PanelState<OperationsLogState>;
  filters: OperationsFilters;
  setFilters: React.Dispatch<React.SetStateAction<OperationsFilters>>;
  cadence: OperationsCadenceMs;
  setCadence(cadence: OperationsCadenceMs): void;
  paused: boolean;
  setPaused(paused: boolean): void;
  refreshing: boolean;
  refresh(): Promise<void>;
}

const CADENCES: readonly OperationsCadenceMs[] = [0, 8000, 15000, 30000];
const EMPTY_FILTERS: OperationsFilters = {
  search: '',
  provider: '',
  model: '',
  endpoint: '',
  status: 'all',
};

const initialPanel = <T>(): PanelState<T> => ({
  status: 'loading',
  data: null,
  error: '',
  updatedAt: null,
});

function message(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'unavailable';
}

function eventParams(filters: OperationsFilters) {
  return {
    range: '1h',
    limit: 200,
    search: filters.search || undefined,
    provider: filters.provider || undefined,
    model: filters.model || undefined,
    endpoint: filters.endpoint || undefined,
    status: filters.status === 'all' ? undefined : filters.status,
  };
}

export function useOperationsFeed(now: () => number = Date.now): OperationsFeed {
  const [storedCadence, storeCadence] = useLocalStorage<OperationsCadenceMs>(
    'operations-cadence-ms',
    15000
  );
  const cadence = CADENCES.includes(storedCadence) ? storedCadence : 15000;
  const [paused, setPaused] = useState(false);
  const [filters, setFilters] = useState<OperationsFilters>(EMPTY_FILTERS);
  const [traffic, setTraffic] = useState<PanelState<UsageStatisticsResponse>>(initialPanel);
  const [routes, setRoutes] = useState<PanelState<UsageSummaryRow[]>>(initialPanel);
  const [events, setEvents] = useState<PanelState<UsageEvent[]>>(initialPanel);
  const [logs, setLogs] = useState<PanelState<OperationsLogState>>(initialPanel);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const runningRef = useRef(false);
  const requestIdRef = useRef(0);
  const latestLogTimestampRef = useRef(0);
  const queuedRef = useRef(false);
  const filtersRef = useRef(filters);
  const filterVersionRef = useRef(0);
  filtersRef.current = filters;

  const refresh = useCallback(async (): Promise<void> => {
    if (runningRef.current) {
      queuedRef.current = true;
      return;
    }
    runningRef.current = true;
    const requestId = ++requestIdRef.current;
    const filterVersion = filterVersionRef.current;
    const finish = () => {
      runningRef.current = false;
      setRefreshing(false);
      if (queuedRef.current) {
        queuedRef.current = false;
        setRefreshTick((current) => current + 1);
      }
    };
    setRefreshing(true);
    setTraffic((current) => (current.data ? current : { ...current, status: 'loading' }));
    setRoutes((current) => (current.data ? current : { ...current, status: 'loading' }));
    setEvents((current) => (current.data ? current : { ...current, status: 'loading' }));
    setLogs((current) => (current.data ? current : { ...current, status: 'loading' }));

    const results = await Promise.allSettled([
      usageApi.getStatistics({ range: '1h' }),
      usageApi.getSummary({ group_by: 'provider', range: '1h' }),
      usageApi.getEvents(eventParams(filtersRef.current)),
      logsApi.fetchLogs({ after: latestLogTimestampRef.current }),
    ]);
    if (requestId !== requestIdRef.current) {
      finish();
      return;
    }
    if (filterVersion !== filterVersionRef.current) {
      queuedRef.current = true;
      finish();
      return;
    }

    const updatedAt = now();
    const [trafficResult, routesResult, eventsResult, logsResult] = results;
    if (trafficResult.status === 'fulfilled') {
      setTraffic({
        status: trafficResult.value.usage.total_requests === 0 ? 'empty' : 'ready',
        data: trafficResult.value,
        error: '',
        updatedAt,
      });
    } else {
      setTraffic((current) => ({
        ...current,
        status: 'error',
        error: message(trafficResult.reason),
        updatedAt,
      }));
    }

    if (routesResult.status === 'fulfilled') {
      const rows = routesResult.value.rows ?? [];
      setRoutes({ status: rows.length ? 'ready' : 'empty', data: rows, error: '', updatedAt });
    } else {
      setRoutes((current) => ({
        ...current,
        status: 'error',
        error: message(routesResult.reason),
        updatedAt,
      }));
    }

    if (eventsResult.status === 'fulfilled') {
      const rows = eventsResult.value.events ?? [];
      setEvents({ status: rows.length ? 'ready' : 'empty', data: rows, error: '', updatedAt });
    } else {
      setEvents((current) => ({
        ...current,
        status: 'error',
        error: message(eventsResult.reason),
        updatedAt,
      }));
    }

    if (logsResult.status === 'fulfilled') {
      const response = logsResult.value;
      latestLogTimestampRef.current = Math.max(
        latestLogTimestampRef.current,
        response['latest-timestamp']
      );
      setLogs((current) => {
        const combined = [...(current.data?.lines ?? []), ...(response.lines ?? [])].slice(-500);
        return {
          status: combined.length ? 'ready' : 'empty',
          data: { lines: combined, latestTimestamp: latestLogTimestampRef.current },
          error: '',
          updatedAt,
        };
      });
    } else {
      setLogs((current) => ({
        ...current,
        status: 'error',
        error: message(logsResult.reason),
        updatedAt,
      }));
    }

    finish();
  }, [now]);

  useEffect(() => {
    filterVersionRef.current += 1;
    void refresh();
  }, [filters, refresh]);

  useEffect(() => {
    if (refreshTick > 0) void refresh();
  }, [refresh, refreshTick]);

  useEffect(() => {
    if (paused || cadence === 0) return;
    let timer = window.setTimeout(tick, cadence);

    async function tick() {
      if (!document.hidden) await refresh();
      timer = window.setTimeout(tick, cadence);
    }

    const handleVisibility = () => {
      if (document.hidden) return;
      window.clearTimeout(timer);
      void tick();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [cadence, paused, refresh]);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
      runningRef.current = false;
    },
    []
  );

  return {
    traffic,
    routes,
    events,
    logs,
    filters,
    setFilters,
    cadence,
    setCadence: storeCadence,
    paused,
    setPaused,
    refreshing,
    refresh,
  };
}
