import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/test/utils';
import type { AuthFileItem } from '@/types';
import type { AuthFileStatusBarData } from '@/features/authFiles/hooks/useAuthFilesStatusBarCache';
import { AuthFileCard, type AuthFileCardProps } from './AuthFileCard';

const baseFile = (overrides: Partial<AuthFileItem> = {}): AuthFileItem => ({
  name: 'codex.json',
  type: 'codex',
  ...overrides,
});

const baseProps = (overrides: Partial<AuthFileCardProps> = {}): AuthFileCardProps => ({
  file: baseFile(),
  compact: false,
  selected: false,
  resolvedTheme: 'light',
  disableControls: false,
  deleting: null,
  statusUpdating: {},
  quotaFilterType: null,
  statusBarCache: new Map<string, AuthFileStatusBarData>(),
  onShowModels: vi.fn(),
  onDownload: vi.fn(),
  onOpenPrefixProxyEditor: vi.fn(),
  onDelete: vi.fn(),
  onToggleStatus: vi.fn(),
  onToggleSelect: vi.fn(),
  ...overrides,
});

describe('AuthFileCard rendering', () => {
  it('renders the file name', () => {
    render(<AuthFileCard {...baseProps({ file: baseFile({ name: 'my-codex.json' }) })} />);

    expect(screen.getByText('my-codex.json')).toBeInTheDocument();
  });

  it('renders the translated type label for the provider', () => {
    render(<AuthFileCard {...baseProps({ file: baseFile({ type: 'codex' }) })} />);

    expect(screen.getByText('Codex')).toBeInTheDocument();
  });

  it('renders a dash for the size when no size is provided', () => {
    render(<AuthFileCard {...baseProps({ file: baseFile({ size: undefined }) })} />);
    const sizeValue = screen.getByText('Size').nextElementSibling;

    expect(sizeValue?.textContent).toBe('-');
  });

  it('renders the formatted size when a size is provided', () => {
    render(<AuthFileCard {...baseProps({ file: baseFile({ size: 2048 }) })} />);
    const sizeValue = screen.getByText('Size').nextElementSibling;

    expect(sizeValue?.textContent).toBe('2.00 KB');
  });

  it('renders the success usage total from the file', () => {
    render(<AuthFileCard {...baseProps({ file: baseFile({ success: 7, failed: 0 }) })} />);

    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('renders the integer priority value when present', () => {
    render(<AuthFileCard {...baseProps({ file: baseFile({ priority: 42 }) })} />);

    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders the note value when present and not compact', () => {
    render(<AuthFileCard {...baseProps({ file: baseFile({ note: 'primary key' }) })} />);

    expect(screen.getByText('primary key')).toBeInTheDocument();
  });
});

describe('AuthFileCard state badge', () => {
  it('shows the disabled badge for a disabled file', () => {
    render(<AuthFileCard {...baseProps({ file: baseFile({ disabled: true }) })} />);

    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('shows the healthy badge when a non-warning status message is present', () => {
    render(<AuthFileCard {...baseProps({ file: baseFile({ status_message: 'ok' }) })} />);

    expect(screen.getByText('Healthy')).toBeInTheDocument();
  });

  it('shows the warning badge when an unhealthy status message is present', () => {
    render(<AuthFileCard {...baseProps({ file: baseFile({ status_message: 'token expired' }) })} />);

    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  it('shows the virtual badge for a runtime-only file', () => {
    render(<AuthFileCard {...baseProps({ file: baseFile({ runtime_only: true }) })} />);

    expect(screen.getByText('Virtual auth file')).toBeInTheDocument();
  });
});

describe('AuthFileCard runtime-only behaviour', () => {
  it('renders no checkboxes for a runtime-only file (selection and status toggle hidden)', () => {
    render(<AuthFileCard {...baseProps({ file: baseFile({ runtime_only: true }) })} />);

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('hides the delete button for a runtime-only file', () => {
    render(<AuthFileCard {...baseProps({ file: baseFile({ runtime_only: true }) })} />);

    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('hides the models button for a non-aistudio runtime-only file', () => {
    render(<AuthFileCard {...baseProps({ file: baseFile({ runtime_only: true, type: 'codex' }) })} />);

    expect(screen.queryByRole('button', { name: 'Models' })).not.toBeInTheDocument();
  });

  it('shows the models button for a runtime-only aistudio file', () => {
    render(
      <AuthFileCard
        {...baseProps({ file: baseFile({ runtime_only: true, type: 'aistudio' }) })}
      />
    );

    expect(screen.getByRole('button', { name: 'Models' })).toBeInTheDocument();
  });
});

describe('AuthFileCard interactions', () => {
  it('invokes onToggleSelect with the file name when the selection checkbox is clicked', async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    render(<AuthFileCard {...baseProps({ onToggleSelect })} />);

    await user.click(screen.getByRole('checkbox', { name: 'Select All' }));

    expect(onToggleSelect).toHaveBeenCalledWith('codex.json');
  });

  it('invokes onShowModels with the file when the models button is clicked', async () => {
    const user = userEvent.setup();
    const onShowModels = vi.fn();
    const file = baseFile();
    render(<AuthFileCard {...baseProps({ file, onShowModels })} />);

    await user.click(screen.getByRole('button', { name: 'Models' }));

    expect(onShowModels).toHaveBeenCalledWith(file);
  });

  it('invokes onDownload with the file name when the download button is clicked', async () => {
    const user = userEvent.setup();
    const onDownload = vi.fn();
    render(<AuthFileCard {...baseProps({ onDownload })} />);

    await user.click(screen.getByRole('button', { name: 'Download' }));

    expect(onDownload).toHaveBeenCalledWith('codex.json');
  });

  it('invokes onOpenPrefixProxyEditor with the file when the details button is clicked', async () => {
    const user = userEvent.setup();
    const onOpenPrefixProxyEditor = vi.fn();
    const file = baseFile();
    render(<AuthFileCard {...baseProps({ file, onOpenPrefixProxyEditor })} />);

    await user.click(screen.getByRole('button', { name: 'Auth File Details / Edit' }));

    expect(onOpenPrefixProxyEditor).toHaveBeenCalledWith(file);
  });

  it('invokes onDelete with the file name when the delete button is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<AuthFileCard {...baseProps({ onDelete })} />);

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledWith('codex.json');
  });

  it('invokes onToggleStatus with false when toggling an enabled file off', async () => {
    const user = userEvent.setup();
    const onToggleStatus = vi.fn();
    const file = baseFile({ disabled: false });
    render(<AuthFileCard {...baseProps({ file, onToggleStatus })} />);

    await user.click(screen.getByRole('checkbox', { name: 'Enabled' }));

    expect(onToggleStatus).toHaveBeenCalledWith(file, false);
  });
});

describe('AuthFileCard control disabling', () => {
  it('disables the download button when controls are disabled', () => {
    render(<AuthFileCard {...baseProps({ disableControls: true })} />);

    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled();
  });

  it('disables the delete button while this file is being deleted', () => {
    render(<AuthFileCard {...baseProps({ deleting: 'codex.json' })} />);

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('keeps the delete button enabled while a different file is being deleted', () => {
    render(<AuthFileCard {...baseProps({ deleting: 'other.json' })} />);

    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('disables the status toggle while this file status is updating', () => {
    render(<AuthFileCard {...baseProps({ statusUpdating: { 'codex.json': true } })} />);

    expect(screen.getByRole('checkbox', { name: 'Enabled' })).toBeDisabled();
  });
});
