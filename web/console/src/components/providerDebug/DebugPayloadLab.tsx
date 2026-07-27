import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/shared/ui';
import styles from './providerDebug.module.scss';

/**
 * A free-form request editor.
 *
 * The fixed checks probe what the bench thinks is interesting; the lab lets an operator
 * send the exact request that is actually failing in their own client, which is often the
 * only way to reproduce a fault the probes miss.
 *
 * Plain textarea rather than a JSON-mode editor: the console has no JSON CodeMirror mode,
 * and routing JSON through the YAML one reports a JSON mistake as a YAML error, which is
 * worse than no highlighting at all.
 */
export function DebugPayloadLab({
  value,
  onChange,
  onSend,
  disabled,
  model,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  model: string;
}) {
  const { t } = useTranslation();
  const [touched, setTouched] = useState(false);

  const error = useMemo(() => {
    if (!value.trim()) return '';
    try {
      JSON.parse(value);
      return '';
    } catch (parseError) {
      return parseError instanceof Error ? parseError.message : String(parseError);
    }
  }, [value]);

  const seed = () =>
    onChange(
      JSON.stringify(
        {
          model: model || 'model-name',
          messages: [{ role: 'user', content: 'Reply OK' }],
          max_tokens: 16,
        },
        null,
        2
      )
    );

  return (
    <div className={styles.lab}>
      <div className={styles.labHeader}>
        <span className={styles.checkDescription}>{t('provider_debug.lab_hint')}</span>
        <div className={styles.actions}>
          <Button variant="ghost" size="sm" onClick={seed} disabled={disabled}>
            {t('provider_debug.lab_seed')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onSend}
            disabled={disabled || !value.trim() || error !== ''}
          >
            {t('provider_debug.lab_send')}
          </Button>
        </div>
      </div>

      <Textarea
        className={styles.labEditor}
        value={value}
        spellCheck={false}
        aria-label={t('provider_debug.lab_label')}
        placeholder={t('provider_debug.lab_placeholder')}
        onBlur={() => setTouched(true)}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />

      {error && touched && (
        <p className={styles.labError} role="alert">
          {t('provider_debug.lab_invalid', { detail: error })}
        </p>
      )}
    </div>
  );
}
