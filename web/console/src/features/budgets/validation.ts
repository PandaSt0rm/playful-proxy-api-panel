import type { BudgetInput } from '@/services/api/aiproxy';

export function validateBudgetInput(input: BudgetInput): string {
  if (!input.name.trim()) return 'name';
  if (input.scope !== 'global' && !input.match.trim()) return 'match';
  if (!Number.isFinite(input.limit_usd) || input.limit_usd <= 0) return 'limit';
  if (
    !Number.isFinite(input.warning_percent) ||
    input.warning_percent < 1 ||
    input.warning_percent > 100
  ) {
    return 'warning';
  }
  return '';
}
