import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  aiproxyApi,
  type Budget,
  type BudgetInput,
  type BudgetStatus,
} from '@/services/api/aiproxy';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SectionPanel } from '@/components/workspace/SectionPanel';
import { WorkspacePage } from '@/components/workspace/WorkspacePage';
import {
  Badge,
  Button,
  ConfirmationDialog,
  Drawer,
  EmptyState,
  ProgressMeter,
  Toggle,
} from '@/shared/ui';
import styles from './OperatorPages.module.scss';

const emptyBudget: BudgetInput = {
  name: '',
  scope: 'global',
  match: '',
  period: 'month',
  limit_usd: 10,
  warning_percent: 80,
  enabled: true,
};

function toInput(budget: Budget): BudgetInput {
  return {
    name: budget.name,
    scope: budget.scope,
    match: budget.match,
    period: budget.period,
    limit_usd: Number(budget.limit_usd),
    warning_percent: budget.warning_percent,
    enabled: budget.enabled,
  };
}

function validate(input: BudgetInput) {
  if (!input.name.trim()) return 'name';
  if (input.scope !== 'global' && !input.match.trim()) return 'match';
  if (!Number.isFinite(input.limit_usd) || input.limit_usd <= 0) return 'limit';
  if (
    !Number.isFinite(input.warning_percent) ||
    input.warning_percent < 1 ||
    input.warning_percent > 100
  )
    return 'warning';
  return '';
}

export function BudgetsPage() {
  const { t } = useTranslation();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [statuses, setStatuses] = useState<BudgetStatus[]>([]);
  const [draft, setDraft] = useState<BudgetInput>(emptyBudget);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleting, setDeleting] = useState<Budget | null>(null);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState('');
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError('');
    const [budgetResult, statusResult] = await Promise.allSettled([
      aiproxyApi.budgets(),
      aiproxyApi.budgetStatus(),
    ]);
    if (budgetResult.status === 'fulfilled') setBudgets(budgetResult.value.budgets);
    if (statusResult.status === 'fulfilled') setStatuses(statusResult.value.statuses);
    if (budgetResult.status === 'rejected' || statusResult.status === 'rejected') setError('load');
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);
  const statusById = useMemo(
    () => Object.fromEntries(statuses.map((status) => [status.budget_id, status])),
    [statuses]
  );
  const summary = useMemo(
    () => ({
      active: statuses.filter((status) => status.status === 'ok').length,
      warning: statuses.filter((status) => status.status === 'warning').length,
      exceeded: statuses.filter((status) => status.status === 'exceeded').length,
      unpriced: statuses.reduce((sum, status) => sum + status.unpriced_events, 0),
    }),
    [statuses]
  );

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyBudget);
    setValidation('');
    setDrawerOpen(true);
  };
  const openEdit = (budget: Budget) => {
    setEditing(budget);
    setDraft(toInput(budget));
    setValidation('');
    setDrawerOpen(true);
  };

  const save = async () => {
    const invalid = validate(draft);
    setValidation(invalid);
    if (invalid) return;
    setPending(true);
    setError('');
    try {
      if (editing) await aiproxyApi.updateBudget(editing.id, draft);
      else await aiproxyApi.createBudget(draft);
      setDrawerOpen(false);
      await load();
    } catch {
      setError('save');
    } finally {
      setPending(false);
    }
  };

  const toggleBudget = async (budget: Budget, enabled: boolean) => {
    setError('');
    try {
      await aiproxyApi.updateBudget(budget.id, { ...toInput(budget), enabled });
      await load();
    } catch {
      setError('toggle');
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setPending(true);
    setError('');
    try {
      await aiproxyApi.deleteBudget(deleting.id);
      setDeleting(null);
      await load();
    } catch {
      setError('delete');
    } finally {
      setPending(false);
    }
  };

  return (
    <WorkspacePage
      eyebrow={t('budgets.eyebrow')}
      title={t('budgets.title')}
      description={t('budgets.description')}
      actions={
        <div className={styles.toolbar}>
          <Button type="button" onClick={() => void load()} loading={loading}>
            {t('budgets.refresh')}
          </Button>
          {budgets.length > 0 && (
            <Button type="button" onClick={openCreate}>
              {t('budgets.create')}
            </Button>
          )}
        </div>
      }
    >
      {error && (
        <div className={styles.stateBlock} role="alert">
          <p>{t(`budgets.errors.${error}`)}</p>
          <Button type="button" onClick={() => void load()}>
            {t('budgets.retry')}
          </Button>
        </div>
      )}
      <div className={styles.signalRail}>
        <div>
          <span>{t('budgets.summary.active')}</span>
          <strong>{summary.active}</strong>
        </div>
        <div>
          <span>{t('budgets.summary.warning')}</span>
          <strong>{summary.warning}</strong>
        </div>
        <div>
          <span>{t('budgets.summary.exceeded')}</span>
          <strong>{summary.exceeded}</strong>
        </div>
        <div>
          <span>{t('budgets.summary.unpriced')}</span>
          <strong>{summary.unpriced}</strong>
        </div>
      </div>
      <SectionPanel id="budget-list" title={t('budgets.list')}>
        {!loading && budgets.length === 0 ? (
          <EmptyState
            title={t('budgets.emptyTitle')}
            description={t('budgets.emptyDescription')}
            action={
              <Button type="button" onClick={openCreate}>
                {t('budgets.create')}
              </Button>
            }
          />
        ) : (
          <div className={styles.tableViewport}>
            <table>
              <thead>
                <tr>
                  <th>{t('budgets.columns.name')}</th>
                  <th>{t('budgets.columns.scope')}</th>
                  <th>{t('budgets.columns.spend')}</th>
                  <th>{t('budgets.columns.period')}</th>
                  <th>{t('budgets.columns.status')}</th>
                  <th>{t('budgets.columns.updated')}</th>
                  <th>{t('budgets.columns.enabled')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {budgets.map((budget) => {
                  const status = statusById[budget.id];
                  return (
                    <tr key={budget.id}>
                      <td>
                        <strong>{budget.name}</strong>
                        <br />
                        <code>{budget.match || t('budgets.global')}</code>
                      </td>
                      <td>{t(`budgets.scope.${budget.scope}`)}</td>
                      <td>
                        {status ? (
                          <ProgressMeter
                            label={`$${status.spent_usd.toFixed(2)} / $${status.limit_usd.toFixed(2)}`}
                            value={Math.min(status.percentage, 100)}
                          />
                        ) : (
                          '—'
                        )}
                        {status?.unpriced_events ? (
                          <Badge tone="caution">
                            {t('budgets.unpriced', { count: status.unpriced_events })}
                          </Badge>
                        ) : null}
                      </td>
                      <td>{t(`budgets.period.${budget.period}`)}</td>
                      <td>
                        <Badge
                          tone={
                            status?.status === 'exceeded'
                              ? 'danger'
                              : status?.status === 'warning'
                                ? 'caution'
                                : 'ok'
                          }
                        >
                          {t(`budgets.status.${status?.status ?? 'unknown'}`)}
                        </Badge>
                      </td>
                      <td>
                        <time>
                          {status?.period_end
                            ? new Date(status.period_end).toLocaleDateString()
                            : '—'}
                        </time>
                      </td>
                      <td>
                        <Toggle
                          label={t('budgets.enabled')}
                          checked={budget.enabled}
                          onChange={(enabled) => void toggleBudget(budget, enabled)}
                        />
                      </td>
                      <td>
                        <div className={styles.toolbar}>
                          <Button type="button" onClick={() => openEdit(budget)}>
                            {t('budgets.edit')}
                          </Button>
                          <Button type="button" onClick={() => setDeleting(budget)}>
                            {t('budgets.delete')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionPanel>

      <Drawer
        open={drawerOpen}
        title={editing ? t('budgets.editTitle') : t('budgets.createTitle')}
        onClose={() => !pending && setDrawerOpen(false)}
      >
        <div className={styles.fieldGrid}>
          <Input
            label={t('budgets.fields.name')}
            value={draft.name}
            error={validation === 'name' ? t('budgets.validation.name') : undefined}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
          <div>
            <label id="budget-scope-label">{t('budgets.fields.scope')}</label>
            <Select
              ariaLabelledBy="budget-scope-label"
              value={draft.scope}
              options={['global', 'provider', 'model', 'api_key'].map((value) => ({
                value,
                label: t(`budgets.scope.${value}`),
              }))}
              onChange={(scope) =>
                setDraft({
                  ...draft,
                  scope: scope as BudgetInput['scope'],
                  match: scope === 'global' ? '' : draft.match,
                })
              }
            />
          </div>
          {draft.scope !== 'global' && (
            <Input
              label={t('budgets.fields.match')}
              value={draft.match}
              error={validation === 'match' ? t('budgets.validation.match') : undefined}
              onChange={(event) => setDraft({ ...draft, match: event.target.value })}
            />
          )}
          <div>
            <label id="budget-period-label">{t('budgets.fields.period')}</label>
            <Select
              ariaLabelledBy="budget-period-label"
              value={draft.period}
              options={['day', 'week', 'month'].map((value) => ({
                value,
                label: t(`budgets.period.${value}`),
              }))}
              onChange={(period) => setDraft({ ...draft, period: period as BudgetInput['period'] })}
            />
          </div>
          <Input
            label={t('budgets.fields.limit')}
            type="number"
            min="0.000001"
            step="0.01"
            value={draft.limit_usd}
            error={validation === 'limit' ? t('budgets.validation.limit') : undefined}
            onChange={(event) => setDraft({ ...draft, limit_usd: Number(event.target.value) })}
          />
          <Input
            label={t('budgets.fields.warning')}
            type="number"
            min="1"
            max="100"
            value={draft.warning_percent}
            error={validation === 'warning' ? t('budgets.validation.warning') : undefined}
            onChange={(event) =>
              setDraft({ ...draft, warning_percent: Number(event.target.value) })
            }
          />
          <Toggle
            label={t('budgets.enabled')}
            checked={draft.enabled}
            onChange={(enabled) => setDraft({ ...draft, enabled })}
          />
          <Button type="button" loading={pending} onClick={() => void save()}>
            {t('budgets.save')}
          </Button>
        </div>
      </Drawer>

      <ConfirmationDialog
        open={deleting !== null}
        title={t('budgets.confirm.title')}
        pending={pending}
        cancelLabel={t('budgets.confirm.cancel')}
        confirmLabel={t('budgets.confirm.submit')}
        onClose={() => setDeleting(null)}
        onConfirm={() => void remove()}
      >
        <p>{t('budgets.confirm.body', { name: deleting?.name ?? '' })}</p>
      </ConfirmationDialog>
    </WorkspacePage>
  );
}
