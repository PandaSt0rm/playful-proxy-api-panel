import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Checkbox, ConfirmationDialog, Drawer, SegmentedControl } from '@/shared/ui';
import {
  DEBUG_CHECKS,
  countBillableCalls,
  countTestableKeys,
  planDebugRun,
} from '@/features/providerDebug/checks';
import { planMatrix } from '@/features/providerDebug/matrix';
import {
  runDirectCheck,
  runDirectPayload,
  runMatrixCell,
} from '@/features/providerDebug/directRunner';
import {
  runRoutedCheck,
  runRoutedPayload,
  supportsRoutedLane,
} from '@/features/providerDebug/routedRunner';
import { aiproxyApi } from '@/services/api/aiproxy';
import { useDebugRun, type DebugJob } from '@/features/providerDebug/useDebugRun';
import type {
  DebugLane,
  DebugRunUnit,
  DebugTarget,
  RegistryCheckId,
} from '@/features/providerDebug/types';
import { DebugCheckRail } from './DebugCheckRail';
import { DebugMatrixView } from './DebugMatrixView';
import { DebugPayloadLab } from './DebugPayloadLab';
import { DebugTraceView } from './DebugTraceView';
import { unitLabel } from './labels';
import styles from './providerDebug.module.scss';

export interface ProviderDebugDrawerProps {
  open: boolean;
  onClose: () => void;
  target: DebugTarget;
}

type BenchTab = 'checks' | 'matrix' | 'lab';

/**
 * The provider debug bench.
 *
 * Lives in a drawer rather than a route so it keeps working against the edit page's
 * unsaved draft state — the single most useful property of the connection test it replaces,
 * and something the saved-credential diagnostics path cannot offer.
 */
export function ProviderDebugDrawer({ open, onClose, target }: ProviderDebugDrawerProps) {
  const { t } = useTranslation();
  const { states, running, run, cancel, reset } = useDebugRun();

  const [tab, setTab] = useState<BenchTab>('checks');
  const [selected, setSelected] = useState<RegistryCheckId[]>(() =>
    DEBUG_CHECKS.filter((check) => !check.billable).map((check) => check.id)
  );
  const [chosenModel, setChosenModel] = useState('');
  const [labBody, setLabBody] = useState('');
  const [lane, setLane] = useState<DebugLane>('direct');
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [pendingRun, setPendingRun] = useState<{ jobs: DebugJob[]; calls: number } | null>(null);
  // The confirmation stays mounted through its close animation, so the count has to
  // outlive `pendingRun` — otherwise the dialog visibly flips to "0 requests" on the way out.
  const promptedCalls = useRef(0);
  if (pendingRun) promptedCalls.current = pendingRun.calls;

  // Reopening the bench should reflect whatever the form says now, not what it said the
  // first time the drawer mounted.
  useEffect(() => {
    if (open) setChosenModel('');
  }, [open]);

  const model = chosenModel || target.model || target.models[0] || '';
  const effectiveTarget = useMemo<DebugTarget>(() => ({ ...target, model }), [target, model]);

  // Lane eligibility is a correctness rule, not a preference. The direct lane inlines the
  // key from the form, so it needs key material; the routed lane asks the server to route
  // through a credential, so it needs one that has been saved.
  const directAvailable = target.keys.some((key) => key.apiKey.trim());
  const savedAuthIndex = target.keys.find((key) => key.authIndex?.trim())?.authIndex?.trim() ?? '';
  const routedAvailable = Boolean(target.routedKind) && savedAuthIndex !== '';
  // A credential with no key material in the form — an OAuth-backed one — can only be
  // exercised through the router, so it lands on the routed lane rather than reporting a
  // false 401 from a token the browser never had.
  const activeLane: DebugLane =
    routedAvailable && (lane === 'routed' || !directAvailable) ? 'routed' : 'direct';

  const testableKeys = countTestableKeys(target.keys);
  const units = useMemo(
    () => planDebugRun(selected, target.keys),
    [selected, target.keys]
  );
  const matrixPlan = useMemo(
    () => planMatrix(target.models, target.keys),
    [target.models, target.keys]
  );

  const activeUnits = useMemo<{ id: string; unit?: DebugRunUnit }[]>(
    () =>
      tab === 'checks'
        ? units.map((unit) => ({ id: unit.id, unit }))
        : tab === 'matrix'
        ? matrixPlan.cells.map((cell) => ({ id: cell.id }))
        : [{ id: 'payload' }],
    [tab, units, matrixPlan.cells]
  );

  // Derived rather than stored: after a run the operator should land on the first failure
  // without hunting for it, but an explicit click always wins.
  const activeId = useMemo(() => {
    if (pinnedId && activeUnits.some((entry) => entry.id === pinnedId)) return pinnedId;
    const firstFailure = activeUnits.find((entry) => {
      const state = states[entry.id];
      return state?.status === 'settled' && state.trace.status === 'fail';
    });
    const firstSettled = activeUnits.find((entry) => states[entry.id]?.status === 'settled');
    return firstFailure?.id ?? firstSettled?.id ?? null;
  }, [pinnedId, activeUnits, states]);

  const activeState = activeId ? states[activeId] : undefined;
  const activeTrace = activeState?.status === 'settled' ? activeState.trace : null;
  const activeUnit = units.find((unit) => unit.id === activeId);
  const activeLabel = activeUnit
    ? unitLabel(t, activeUnit)
    : (activeTrace?.meta?.model ?? t('provider_debug.tab_matrix'));

  const toggleCheck = (id: RegistryCheckId) =>
    setSelected((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]
    );

  /** Billable work never starts without an explicit, counted confirmation. */
  const requestRun = (jobs: DebugJob[], calls: number) => {
    setPinnedId(null);
    reset();
    if (calls > 0) {
      setPendingRun({ jobs, calls });
      return;
    }
    run(jobs);
  };

  const handleRunChecks = () => {
    // Deterministic within a run; the server echoes it back so history can be grouped
    // client-side without a schema change.
    const runId = `${activeLane}-${units.length}-${units.map((unit) => unit.id).join(',')}`;
    requestRun(
      units.map((unit) => ({
        id: unit.id,
        run: (deps) =>
          activeLane === 'routed'
            ? runRoutedCheck(
                unit,
                effectiveTarget,
                { kind: target.routedKind ?? '', authIndex: savedAuthIndex },
                { runDiagnostic: (payload) => aiproxyApi.diagnostics(payload), now: deps.now },
                runId
              )
            : runDirectCheck(unit, effectiveTarget, deps),
      })),
      activeLane === 'routed'
        ? units.filter((unit) => unit.check.billable && supportsRoutedLane(unit.check.id)).length
        : countBillableCalls(units)
    );
  };

  const handleRunMatrix = () =>
    requestRun(
      matrixPlan.cells.map((cell) => ({
        id: cell.id,
        run: (deps) => runMatrixCell(cell, effectiveTarget, deps),
      })),
      matrixPlan.cells.length
    );

  const handleRunPayload = () =>
    requestRun(
      [
        {
          id: 'payload',
          run: (deps) =>
            activeLane === 'routed'
              ? runRoutedPayload(
                  labBody,
                  effectiveTarget,
                  { kind: target.routedKind ?? '', authIndex: savedAuthIndex },
                  { runDiagnostic: (payload) => aiproxyApi.diagnostics(payload), now: deps.now },
                  'lab'
                )
              : runDirectPayload(labBody, effectiveTarget, deps),
        },
      ],
      1
    );

  const confirmRun = () => {
    if (!pendingRun) return;
    run(pendingRun.jobs);
    setPendingRun(null);
  };

  const runAction = running ? (
    <Button variant="secondary" size="sm" onClick={cancel}>
      {t('provider_debug.cancel')}
    </Button>
  ) : tab === 'lab' ? null : tab === 'checks' ? (
    <Button variant="primary" size="sm" disabled={!units.length} onClick={handleRunChecks}>
      {t('provider_debug.run')}
    </Button>
  ) : (
    <Button
      variant="primary"
      size="sm"
      disabled={!matrixPlan.cells.length}
      onClick={handleRunMatrix}
    >
      {t('provider_debug.run_matrix', { count: matrixPlan.cells.length })}
    </Button>
  );

  const tracePane = (
    <section className={styles.tracePane} aria-label={t('provider_debug.trace_heading')}>
      {activeTrace ? (
        <DebugTraceView trace={activeTrace} label={activeLabel} />
      ) : (
        <p className={styles.empty}>
          {Object.keys(states).length
            ? t('provider_debug.awaiting')
            : t('provider_debug.empty_trace')}
        </p>
      )}
    </section>
  );

  // The left pane switches; the trace pane does not. Rendering it once, outside the
  // switcher, keeps a single trace in the DOM instead of one per hidden view.
  const leftPane =
    tab === 'lab' ? (
      <DebugPayloadLab
        value={labBody}
        onChange={setLabBody}
        onSend={handleRunPayload}
        disabled={running}
        model={model}
      />
    ) : tab === 'checks' ? (
      Object.keys(states).length ? (
        <DebugCheckRail units={units} states={states} activeId={activeId} onSelect={setPinnedId} />
      ) : (
        <p className={styles.empty}>{t('provider_debug.empty')}</p>
      )
    ) : (
      <>
        <DebugMatrixView
          plan={matrixPlan}
          states={states}
          activeId={activeId}
          onSelect={setPinnedId}
        />
        {matrixPlan.dropped > 0 && (
          <p className={styles.empty}>
            {t('provider_debug.matrix_capped', {
              count: matrixPlan.dropped,
              cap: matrixPlan.cells.length,
            })}
          </p>
        )}
      </>
    );

  return (
    <Drawer
      open={open}
      size="wide"
      title={t('provider_debug.title', { provider: target.providerLabel })}
      onClose={onClose}
    >
      <div className={styles.bench}>
        <div className={styles.controls}>
          <div className={styles.checkOptions}>
            {tab === 'checks' ? (
              DEBUG_CHECKS.map((check) => (
                <label key={check.id} className={styles.checkOption}>
                  <Checkbox
                    checked={selected.includes(check.id)}
                    onChange={() => toggleCheck(check.id)}
                    disabled={running}
                  />
                  <span className={styles.checkText}>
                    <span className={styles.checkName}>
                      {t(check.labelKey)}
                      {check.billable && (
                        <span className={styles.billableTag}>
                          {t('provider_debug.billable_tag')}
                        </span>
                      )}
                    </span>
                    <span className={styles.checkDescription}>{t(check.descriptionKey)}</span>
                  </span>
                </label>
              ))
            ) : tab === 'matrix' ? (
              <p className={styles.checkDescription}>{t('provider_debug.matrix_hint')}</p>
            ) : null}
          </div>

          <div className={styles.actions}>
            {target.models.length > 0 && (
              <Select
                value={model}
                options={target.models.map((entry) => ({ value: entry, label: entry }))}
                onChange={setChosenModel}
                disabled={running}
                ariaLabel={t('provider_debug.model_label')}
                className={styles.modelSelect}
              />
            )}
            <span className={styles.keyCount}>
              {t('provider_debug.key_count', { count: testableKeys })}
            </span>
            {runAction}
          </div>
        </div>

        {routedAvailable && (
          <SegmentedControl
            label={t('provider_debug.lane_label')}
            value={activeLane}
            onChange={(next) => {
              setLane(next);
              setPinnedId(null);
              reset();
            }}
            options={[
              { value: 'direct', label: t('provider_debug.lane_direct') },
              { value: 'routed', label: t('provider_debug.lane_routed') },
            ]}
          />
        )}

        <SegmentedControl
          label={t('provider_debug.tabs_label')}
          value={tab}
          onChange={(next) => {
            setTab(next);
            setPinnedId(null);
            reset();
          }}
          options={[
            { value: 'checks', label: t('provider_debug.tab_checks') },
            { value: 'matrix', label: t('provider_debug.tab_matrix') },
            { value: 'lab', label: t('provider_debug.tab_lab') },
          ]}
        />

        <div className={styles.panes}>
          <section
            className={styles.railPane}
            aria-label={
              tab === 'checks'
                ? t('provider_debug.checks_heading')
                : tab === 'matrix'
                  ? t('provider_debug.tab_matrix')
                  : t('provider_debug.tab_lab')
            }
          >
            {leftPane}
          </section>
          {tracePane}
        </div>
      </div>

      <ConfirmationDialog
        open={pendingRun !== null}
        title={t('provider_debug.confirm_title')}
        confirmLabel={t('provider_debug.confirm_action')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmRun}
        onClose={() => setPendingRun(null)}
      >
        {t('provider_debug.confirm_body', { count: promptedCalls.current })}
      </ConfirmationDialog>
    </Drawer>
  );
}
