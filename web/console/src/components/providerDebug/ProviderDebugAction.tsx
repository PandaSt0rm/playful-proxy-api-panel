import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import type { DebugTarget } from '@/features/providerDebug/types';
import { ProviderDebugDrawer } from './ProviderDebugDrawer';

/**
 * The bench's entry point, so a provider edit page adds it in one line rather than
 * repeating the button, the open state, and the drawer six times.
 */
export function ProviderDebugAction({
  target,
  disabled,
}: {
  target: DebugTarget;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        {t('provider_debug.open')}
      </Button>
      <ProviderDebugDrawer open={open} onClose={() => setOpen(false)} target={target} />
    </>
  );
}
