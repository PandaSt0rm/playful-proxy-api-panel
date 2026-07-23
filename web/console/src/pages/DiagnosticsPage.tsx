import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api/authFiles';
import { providersApi } from '@/services/api/providers';
import { aiproxyApi, type DiagnosticResult } from '@/services/api/aiproxy';
import { Select } from '@/components/ui/Select';
import { SectionPanel } from '@/components/workspace/SectionPanel';
import { WorkspacePage } from '@/components/workspace/WorkspacePage';
import { Badge, Button, ConfirmationDialog, EmptyState, Skeleton } from '@/shared/ui';
import {
  buildDiagnosticCredentialOptions,
  type DiagnosticCredentialKind,
  type DiagnosticCredentialOption,
  type DiagnosticCredentialSources,
} from '@/features/diagnostics/credentials';
import styles from './OperatorPages.module.scss';

const KINDS: readonly DiagnosticCredentialKind[] = [
  'gemini-api-key',
  'interactions-api-key',
  'claude-api-key',
  'xai-api-key',
  'codex',
  'vertex-api-key',
  'openai-compatibility',
  'auth-file',
];

type DiagnosticCheck = 'models' | 'connectivity';

function redactDetail(value: unknown, key = ''): unknown {
  if (/key|token|secret|authorization/i.test(key)) return '[redacted]';
  if (Array.isArray(value)) return value.map((item) => redactDetail(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactDetail(entryValue, entryKey),
      ])
    );
  }
  return value;
}

function getModels(result: DiagnosticResult) {
  const models = result.detail?.models;
  return Array.isArray(models)
    ? models.filter((model): model is string => typeof model === 'string')
    : [];
}

function ResultPanel({ result, previous }: { result: DiagnosticResult; previous: boolean }) {
  const { t } = useTranslation();
  const [modelSearch, setModelSearch] = useState('');
  const models = getModels(result);
  const visibleModels = models.filter((model) =>
    model.toLowerCase().includes(modelSearch.toLowerCase())
  );
  const zeroModelWarning = result.check === 'models' && result.model_count === 0;
  const tone =
    result.status === 'pass' && !zeroModelWarning
      ? 'ok'
      : result.status === 'fail'
        ? 'danger'
        : 'caution';
  return (
    <div className={styles.resultPanel}>
      <div className={styles.resultHeading}>
        <h3>{previous ? t('diagnostics.result.previous') : t('diagnostics.result.current')}</h3>
        <Badge tone={tone}>
          {zeroModelWarning
            ? t('diagnostics.result.zeroModels')
            : t(`diagnostics.status.${result.status}`)}
        </Badge>
      </div>
      <p>{result.message}</p>
      <dl className={styles.detailGrid}>
        <div>
          <dt>{t('diagnostics.result.target')}</dt>
          <dd>{result.target.label}</dd>
        </div>
        <div>
          <dt>{t('diagnostics.result.check')}</dt>
          <dd>{t(`diagnostics.check.${result.check}`)}</dd>
        </div>
        <div>
          <dt>{t('diagnostics.result.checked')}</dt>
          <dd>
            <time dateTime={result.checked_at}>{new Date(result.checked_at).toLocaleString()}</time>
          </dd>
        </div>
        <div>
          <dt>{t('diagnostics.result.latency')}</dt>
          <dd>
            <code>{result.latency_ms} ms</code>
          </dd>
        </div>
        {result.http_status !== undefined && (
          <div>
            <dt>{t('diagnostics.result.http')}</dt>
            <dd>
              <code>{result.http_status}</code>
            </dd>
          </div>
        )}
        {result.model_count !== undefined && (
          <div>
            <dt>{t('diagnostics.result.modelCount')}</dt>
            <dd>
              <code>{result.model_count}</code>
            </dd>
          </div>
        )}
        <div>
          <dt>{t('diagnostics.result.category')}</dt>
          <dd>
            <code>{result.category || '—'}</code>
          </dd>
        </div>
        {typeof result.detail?.tested_model === 'string' && (
          <div>
            <dt>{t('diagnostics.result.testedModel')}</dt>
            <dd>
              <code>{result.detail.tested_model}</code>
            </dd>
          </div>
        )}
      </dl>
      {models.length > 0 && (
        <div className={styles.modelResults}>
          <input
            aria-label={t('diagnostics.result.searchModels')}
            value={modelSearch}
            onChange={(event) => setModelSearch(event.target.value)}
          />
          <ul>
            {visibleModels.map((model) => (
              <li key={model}>
                <code>{model}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.detail && (
        <pre className={styles.safeDetail}>
          <code>{JSON.stringify(redactDetail(result.detail), null, 2)}</code>
        </pre>
      )}
    </div>
  );
}

export function DiagnosticsPage() {
  const { t } = useTranslation();
  const [kind, setKind] = useState<DiagnosticCredentialKind>('gemini-api-key');
  const [authIndex, setAuthIndex] = useState('');
  const [check, setCheck] = useState<DiagnosticCheck>('models');
  const [credentials, setCredentials] = useState<DiagnosticCredentialOption[]>([]);
  const [credentialsLoading, setCredentialsLoading] = useState(true);
  const [credentialsError, setCredentialsError] = useState('');
  const [history, setHistory] = useState<DiagnosticResult[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [resultIsPrevious, setResultIsPrevious] = useState(false);
  const [runError, setRunError] = useState('');
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadCredentials = useCallback(async () => {
    setCredentialsLoading(true);
    setCredentialsError('');
    const results = await Promise.allSettled([
      providersApi.getGeminiKeys(),
      providersApi.getInteractionsConfigs(),
      providersApi.getClaudeConfigs(),
      providersApi.getXAIConfigs(),
      providersApi.getCodexConfigs(),
      providersApi.getVertexConfigs(),
      providersApi.getOpenAIProviders(),
      authFilesApi.list(),
    ]);
    const sources: DiagnosticCredentialSources = {};
    const keys: Array<keyof Omit<DiagnosticCredentialSources, 'authFiles'>> = [
      'gemini',
      'interactions',
      'claude',
      'xai',
      'codex',
      'vertex',
      'openai',
    ];
    keys.forEach((key, index) => {
      const response = results[index];
      if (response.status === 'fulfilled') Object.assign(sources, { [key]: response.value });
    });
    const authResponse = results[7];
    if (authResponse.status === 'fulfilled') sources.authFiles = authResponse.value.files;
    const failed = results.filter((response) => response.status === 'rejected').length;
    setCredentials(buildDiagnosticCredentialOptions(sources));
    setCredentialsError(failed === results.length ? 'error' : failed ? 'partial' : '');
    setCredentialsLoading(false);
  }, []);

  const selectedCredential =
    credentials.find(
      (credential) => credential.kind === kind && credential.authIndex === authIndex
    ) ?? null;
  const optionsForKind = credentials.filter((credential) => credential.kind === kind);

  const loadHistory = useCallback(async () => {
    if (!authIndex) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const query = new URLSearchParams({ kind, auth_index: authIndex, limit: '50' }).toString();
      const response = await aiproxyApi.diagnosticHistory(query);
      setHistory(response.results ?? []);
    } catch {
      setHistoryError('error');
    } finally {
      setHistoryLoading(false);
    }
  }, [authIndex, kind]);

  useEffect(() => {
    void loadCredentials();
  }, [loadCredentials]);
  useEffect(() => {
    if (optionsForKind.some((credential) => credential.authIndex === authIndex)) return;
    setAuthIndex(optionsForKind[0]?.authIndex ?? '');
  }, [authIndex, optionsForKind]);
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const submit = async (credential: DiagnosticCredentialOption, acknowledgeBillable: boolean) => {
    setPending(true);
    setRunError('');
    try {
      const next = await aiproxyApi.diagnostics({
        target: { kind, auth_index: credential.authIndex },
        check,
        ...(acknowledgeBillable ? { acknowledge_billable: true } : {}),
      });
      setResult(next);
      setResultIsPrevious(false);
      await loadHistory();
    } catch {
      setRunError('error');
      if (result) setResultIsPrevious(true);
    } finally {
      setPending(false);
      setConfirmOpen(false);
    }
  };

  const run = () => {
    if (check === 'connectivity') setConfirmOpen(true);
    else void submit(selectedCredential!, false);
  };

  const runAgain = (historyResult: DiagnosticResult) => {
    const nextKind = historyResult.target.kind as DiagnosticCredentialKind;
    if (KINDS.includes(nextKind)) setKind(nextKind);
    setAuthIndex(historyResult.target.auth_index);
    setCheck(historyResult.check === 'connectivity' ? 'connectivity' : 'models');
    setResult(historyResult);
    setResultIsPrevious(false);
  };

  return (
    <WorkspacePage
      eyebrow={t('diagnostics.eyebrow')}
      title={t('diagnostics.title')}
      description={t('diagnostics.description')}
    >
      <div className={styles.diagnosticsWorkbench}>
        <SectionPanel
          id="diagnostic-target"
          title={t('diagnostics.target.title')}
          description={t('diagnostics.target.description')}
          status={
            credentialsError === 'partial' ? (
              <Badge tone="caution">{t('diagnostics.partial')}</Badge>
            ) : undefined
          }
        >
          {credentialsLoading ? (
            <Skeleton label={t('diagnostics.target.loading')} />
          ) : credentialsError === 'error' ? (
            <div className={styles.stateBlock} role="alert">
              <p>{t('diagnostics.target.error')}</p>
              <Button type="button" onClick={() => void loadCredentials()}>
                {t('diagnostics.retry')}
              </Button>
            </div>
          ) : (
            <div className={styles.fieldGrid}>
              <Select
                ariaLabel={t('diagnostics.target.kind')}
                value={kind}
                options={KINDS.map((value) => ({ value, label: t(`diagnostics.kind.${value}`) }))}
                onChange={(value) => setKind(value as DiagnosticCredentialKind)}
              />
              <Select
                ariaLabel={t('diagnostics.target.credential')}
                value={authIndex}
                placeholder={t('diagnostics.target.select')}
                options={optionsForKind.map((credential) => ({
                  value: credential.authIndex,
                  label: credential.label,
                }))}
                onChange={setAuthIndex}
              />
              {selectedCredential ? (
                <dl className={styles.selectedTarget}>
                  <dt>{t('diagnostics.target.selected')}</dt>
                  <dd>{selectedCredential.label}</dd>
                  <dd>
                    <code>{selectedCredential.authIndex}</code>
                  </dd>
                </dl>
              ) : (
                <EmptyState
                  title={t('diagnostics.target.emptyTitle')}
                  description={t('diagnostics.target.emptyDescription')}
                  action={
                    <Link
                      to={
                        optionsForKind[0]?.setupPath ??
                        (kind === 'auth-file' ? '/auth-files' : '/ai-providers')
                      }
                    >
                      {t('diagnostics.target.setup')}
                    </Link>
                  }
                />
              )}
            </div>
          )}
        </SectionPanel>

        <SectionPanel
          id="diagnostic-check"
          title={t('diagnostics.check.title')}
          description={t('diagnostics.check.description')}
        >
          <div
            className={styles.checkCards}
            role="radiogroup"
            aria-label={t('diagnostics.check.title')}
          >
            {(['models', 'connectivity'] as const).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="diagnostic-check"
                  value={value}
                  checked={check === value}
                  disabled={pending}
                  onChange={() => setCheck(value)}
                />
                <strong>{t(`diagnostics.check.${value}`)}</strong>
                <span>{t(`diagnostics.check.${value}Description`)}</span>
              </label>
            ))}
          </div>
          <Button
            type="button"
            loading={pending}
            disabled={!selectedCredential || pending}
            onClick={run}
          >
            {t('diagnostics.run')}
          </Button>
          {runError && <p role="alert">{t('diagnostics.runError')}</p>}
        </SectionPanel>
      </div>

      <SectionPanel
        id="diagnostic-result"
        title={t('diagnostics.result.title')}
        status={pending ? <Badge tone="info">{t('diagnostics.running')}</Badge> : undefined}
      >
        <div aria-busy={pending || undefined}>
          {result ? (
            <ResultPanel result={result} previous={resultIsPrevious} />
          ) : (
            <EmptyState
              title={t('diagnostics.result.emptyTitle')}
              description={t('diagnostics.result.emptyDescription')}
            />
          )}
        </div>
      </SectionPanel>

      <SectionPanel
        id="diagnostic-history"
        title={t('diagnostics.history.title')}
        description={t('diagnostics.history.description')}
        actions={
          <Button type="button" onClick={() => void loadHistory()}>
            {t('diagnostics.refresh')}
          </Button>
        }
      >
        {historyLoading ? (
          <Skeleton label={t('diagnostics.history.loading')} />
        ) : historyError ? (
          <div className={styles.stateBlock} role="alert">
            <p>{t('diagnostics.history.error')}</p>
            <Button type="button" onClick={() => void loadHistory()}>
              {t('diagnostics.retry')}
            </Button>
          </div>
        ) : history.length === 0 ? (
          <EmptyState
            title={t('diagnostics.history.emptyTitle')}
            description={t('diagnostics.history.emptyDescription')}
          />
        ) : (
          <div className={styles.tableViewport}>
            <table>
              <thead>
                <tr>
                  <th>{t('diagnostics.history.time')}</th>
                  <th>{t('diagnostics.history.target')}</th>
                  <th>{t('diagnostics.history.check')}</th>
                  <th>{t('diagnostics.history.status')}</th>
                  <th>{t('diagnostics.history.latency')}</th>
                  <th>{t('diagnostics.history.summary')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <button
                        type="button"
                        className={styles.rowTrigger}
                        onClick={() => {
                          setResult(item);
                          setResultIsPrevious(false);
                        }}
                      >
                        {new Date(item.checked_at).toLocaleString()}
                      </button>
                    </td>
                    <td>{item.target.label}</td>
                    <td>{t(`diagnostics.check.${item.check}`)}</td>
                    <td>
                      <Badge
                        tone={
                          item.status === 'pass'
                            ? 'ok'
                            : item.status === 'fail'
                              ? 'danger'
                              : 'caution'
                        }
                      >
                        {t(`diagnostics.status.${item.status}`)}
                      </Badge>
                    </td>
                    <td>{item.latency_ms} ms</td>
                    <td>{item.http_status ?? item.model_count ?? item.category}</td>
                    <td>
                      <Button type="button" onClick={() => runAgain(item)}>
                        {t('diagnostics.history.runAgain')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionPanel>

      <ConfirmationDialog
        open={confirmOpen}
        title={t('diagnostics.confirm.title')}
        pending={pending}
        cancelLabel={t('diagnostics.confirm.cancel')}
        confirmLabel={t('diagnostics.confirm.submit')}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void submit(selectedCredential!, true)}
      >
        <p>{t('diagnostics.confirm.body', { credential: selectedCredential?.label ?? '' })}</p>
      </ConfirmationDialog>
    </WorkspacePage>
  );
}
