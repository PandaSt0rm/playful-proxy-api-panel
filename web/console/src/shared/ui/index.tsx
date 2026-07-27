import {
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useId,
  useState,
} from 'react';
import ReactCodeMirror from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner as Spinner } from '@/components/ui/LoadingSpinner';
import { AutocompleteInput as Autocomplete } from '@/components/ui/AutocompleteInput';
import './styles.scss';

export { Button, Modal, EmptyState, Spinner, Autocomplete };

export function IconButton({
  label,
  busy,
  children,
  ...props
}: {
  label: string;
  busy?: boolean;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      className={['rf-icon-button', props.className].filter(Boolean).join(' ')}
      aria-label={label}
      aria-busy={busy || undefined}
    >
      {children}
    </button>
  );
}

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="rf-password-input">
      <input
        {...props}
        className={['rf-input', props.className].filter(Boolean).join(' ')}
        type={visible ? 'text' : 'password'}
      />
      <button
        type="button"
        className="rf-password-input__toggle"
        aria-label={visible ? 'Hide value' : 'Show value'}
        onClick={() => setVisible(!visible)}
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </span>
  );
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} className={['rf-textarea', props.className].filter(Boolean).join(' ')} />
  );
}
export function Checkbox(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={['rf-checkbox', props.className].filter(Boolean).join(' ')}
      type="checkbox"
    />
  );
}
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className="rf-toggle"
      onClick={() => onChange(!checked)}
    >
      {label}
    </button>
  );
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="rf-segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="rf-segmented__option"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({
  label,
  value,
  tabs,
  onChange,
}: {
  label: string;
  value: T;
  tabs: Array<{ id: T; label: string; panel: ReactNode }>;
  onChange: (id: T) => void;
}) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[next].id);
    document.getElementById(`tab-${tabs[next].id}`)?.focus();
  };
  return (
    <>
      <div className="rf-tabs" role="tablist" aria-label={label}>
        {tabs.map((tab, index) => (
          <button
            id={`tab-${tab.id}`}
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={value === tab.id}
            className="rf-tabs__tab"
            aria-controls={`panel-${tab.id}`}
            tabIndex={value === tab.id ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab.id}`}
          hidden={value !== tab.id}
          className="rf-tabs__panel"
        >
          {tab.panel}
        </div>
      ))}
    </>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'ok' | 'caution' | 'danger' | 'info';
  children: ReactNode;
}) {
  return <span className={`rf-badge rf-badge--${tone}`}>{children}</span>;
}
export function ProgressMeter({
  label,
  value,
  max = 100,
}: {
  label: string;
  value: number;
  max?: number;
}) {
  return (
    <label className="rf-progress">
      <span>{label}</span>
      <progress value={value} max={max} />
      <span>{Math.round((value / max) * 100)}%</span>
    </label>
  );
}
export function Pagination({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  return (
    <nav className="rf-pagination" aria-label="Pagination">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      <span aria-live="polite">
        Page {page} of {pages}
      </span>
      <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </nav>
  );
}
export function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="rf-code-block">
      <code>{children}</code>
    </pre>
  );
}
export function Skeleton({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="rf-skeleton" role="status">
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Toast({
  tone = 'info',
  children,
}: {
  tone?: 'success' | 'info' | 'error';
  children: ReactNode;
}) {
  return (
    <div
      className={`rf-toast rf-toast--${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      {children}
    </div>
  );
}

export function ConfirmationDialog({
  open,
  title,
  children,
  pending,
  onConfirm,
  onClose,
  cancelLabel = 'Cancel',
  confirmLabel = 'Confirm',
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  pending?: boolean;
  cancelLabel?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={pending ? () => {} : onClose}>
      <div className="rf-dialog__body">{children}</div>
      <div className="rf-dialog__actions">
        <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button type="button" onClick={onConfirm} loading={pending}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/**
 * Widths are passed as props rather than left to CSS because `Modal` applies its `width`
 * prop as an inline style, which beats any class rule. Before this, `.rf-drawer`'s width
 * declaration never applied and every drawer rendered at Modal's 520px default.
 *
 * Plain pixel values, not `min()` clamps: Modal already sets `max-width: 100%` and the
 * overlay carries padding, so narrow viewports clamp on their own.
 */
const DRAWER_WIDTHS = {
  default: 560,
  /** Wide enough for a two-pane workspace such as the provider debug bench. */
  wide: 1080,
} as const;

export function Drawer({
  open,
  title,
  children,
  onClose,
  size = 'default',
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: keyof typeof DRAWER_WIDTHS;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      className={size === 'wide' ? 'rf-drawer rf-drawer--wide' : 'rf-drawer'}
      width={DRAWER_WIDTHS[size]}
    >
      <div className="rf-drawer__body">{children}</div>
    </Modal>
  );
}
export function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="rf-diff" aria-label="Configuration diff">
      <code>{diff}</code>
    </pre>
  );
}
export function CodeMirrorSurface({
  value,
  onChange,
  label = 'YAML editor',
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <div className="rf-code-mirror" aria-label={label}>
      <ReactCodeMirror value={value} extensions={[yaml()]} onChange={onChange} />
    </div>
  );
}

export function DataTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: Array<{ key: string; label: string; sort?: 'ascending' | 'descending' | 'none' }>;
  rows: Array<Record<string, ReactNode>>;
}) {
  return (
    <div className="rf-table-viewport">
      <table className="rf-data-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header.key} scope="col" aria-sort={header.sort}>
                {header.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row.id ?? index)}>
              {headers.map((header) => (
                <td key={header.key}>{row[header.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (ids: { inputId: string; descriptionId: string | undefined }) => ReactNode;
}) {
  const id = useId();
  const descriptionId = hint ? `${id}-hint` : undefined;
  return (
    <div className="rf-field">
      <label htmlFor={id}>{label}</label>
      {children({ inputId: id, descriptionId })}
      {hint && <p id={descriptionId}>{hint}</p>}
    </div>
  );
}
export function Surface({
  as: Tag = 'section',
  label,
  children,
  className,
  ...props
}: { as?: 'section' | 'div'; label?: string; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      aria-label={label}
      {...props}
      className={['rf-surface', className].filter(Boolean).join(' ')}
    >
      {children}
    </Tag>
  );
}
