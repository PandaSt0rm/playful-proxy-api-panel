import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent, waitFor, within } from '@/test/utils';
import {
  AuthFileModelsModal,
  type AuthFileModelsModalProps,
} from './AuthFileModelsModal';

const baseProps = (
  overrides: Partial<AuthFileModelsModalProps> = {}
): AuthFileModelsModalProps => ({
  open: true,
  fileName: 'codex.json',
  fileType: 'codex',
  loading: false,
  error: null,
  models: [],
  excluded: {},
  onClose: vi.fn(),
  onCopyText: vi.fn(),
  ...overrides,
});

describe('AuthFileModelsModal visibility', () => {
  it('renders nothing when open is false', () => {
    render(<AuthFileModelsModal {...baseProps({ open: false })} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('includes the file name in the title when open', () => {
    render(<AuthFileModelsModal {...baseProps({ fileName: 'codex.json' })} />);

    expect(screen.getByText('Supported models - codex.json')).toBeInTheDocument();
  });
});

describe('AuthFileModelsModal content states', () => {
  it('shows the loading message while loading', () => {
    render(<AuthFileModelsModal {...baseProps({ loading: true })} />);

    expect(screen.getByText('Loading model list...')).toBeInTheDocument();
  });

  it('shows the unsupported empty state when error is unsupported', () => {
    render(<AuthFileModelsModal {...baseProps({ error: 'unsupported' })} />);

    expect(
      screen.getByText('This feature is not supported in the current version')
    ).toBeInTheDocument();
  });

  it('shows the empty-models state when there are no models', () => {
    render(<AuthFileModelsModal {...baseProps({ models: [] })} />);

    expect(screen.getByText('No available models for this credential')).toBeInTheDocument();
  });

  it('renders each model id in the list', () => {
    render(
      <AuthFileModelsModal
        {...baseProps({ models: [{ id: 'gpt-4o' }, { id: 'gpt-4' }] })}
      />
    );

    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
  });

  it('renders the display name when it differs from the model id', () => {
    render(
      <AuthFileModelsModal
        {...baseProps({ models: [{ id: 'gpt-4o', display_name: 'GPT-4o' }] })}
      />
    );

    expect(screen.getByText('GPT-4o')).toBeInTheDocument();
  });

  it('does not render the display name when it equals the model id', () => {
    render(
      <AuthFileModelsModal
        {...baseProps({ models: [{ id: 'gpt-4o', display_name: 'gpt-4o' }] })}
      />
    );

    expect(screen.getAllByText('gpt-4o')).toHaveLength(1);
  });

  it('shows the disabled badge for a model that is in the excluded list', () => {
    render(
      <AuthFileModelsModal
        {...baseProps({
          models: [{ id: 'gpt-4o' }],
          fileType: 'codex',
          excluded: { codex: ['gpt-4o'] },
        })}
      />
    );

    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('does not show a disabled badge for a model that is not excluded', () => {
    render(
      <AuthFileModelsModal
        {...baseProps({
          models: [{ id: 'gpt-4o' }],
          fileType: 'codex',
          excluded: { codex: ['other-model'] },
        })}
      />
    );

    expect(screen.queryByText('Disabled')).not.toBeInTheDocument();
  });
});

describe('AuthFileModelsModal interactions', () => {
  it('invokes onCopyText with the model id when a model row is clicked', async () => {
    const user = userEvent.setup();
    const onCopyText = vi.fn();
    render(<AuthFileModelsModal {...baseProps({ models: [{ id: 'gpt-4o' }], onCopyText })} />);

    await user.click(screen.getByText('gpt-4o'));

    expect(onCopyText).toHaveBeenCalledWith('gpt-4o');
  });

  it('invokes onClose when the footer close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AuthFileModelsModal {...baseProps({ onClose })} />);
    const dialog = screen.getByRole('dialog');
    const footer = dialog.querySelector('.modal-footer');
    if (!(footer instanceof HTMLElement)) throw new Error('expected a modal footer');

    await user.click(within(footer).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
