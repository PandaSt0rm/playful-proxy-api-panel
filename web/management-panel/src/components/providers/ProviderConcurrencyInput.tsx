import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import type { UpstreamConcurrencyConfig } from '@/types';
import { getEffectiveProviderConcurrency } from '@/utils/upstreamConcurrency';

interface ProviderConcurrencyInputProps {
  providerKey: string;
  value: string;
  config?: UpstreamConcurrencyConfig;
  disabled?: boolean;
  error?: string;
  onChange: (value: string) => void;
}

export function ProviderConcurrencyInput({
  providerKey,
  value,
  config,
  disabled,
  error,
  onChange,
}: ProviderConcurrencyInputProps) {
  const { t } = useTranslation();
  const effective = getEffectiveProviderConcurrency(config, providerKey);
  const inheritedText =
    effective.source === 'default' && effective.limit !== undefined
      ? t('ai_providers.concurrency_inherited_default', {
          defaultValue: 'Blank inherits default limit {{limit}}.',
          limit: effective.limit,
        })
      : t('ai_providers.concurrency_blank_unlimited', {
          defaultValue: 'Blank removes the provider override. 0 explicitly means unlimited.',
        });

  return (
    <Input
      label={t('ai_providers.concurrency_limit_label', {
        defaultValue: 'Upstream Concurrency Limit',
      })}
      type="number"
      min={0}
      placeholder={effective.source === 'default' ? String(effective.limit ?? '') : '0'}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      error={error}
      hint={inheritedText}
    />
  );
}
