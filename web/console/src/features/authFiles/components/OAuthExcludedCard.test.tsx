import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/test/utils';
import { OAuthExcludedCard, type OAuthExcludedCardProps } from './OAuthExcludedCard';

const baseProps = (overrides: Partial<OAuthExcludedCardProps> = {}): OAuthExcludedCardProps => ({
  disableControls: false,
  excludedError: null,
  excluded: {},
  onAdd: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  ...overrides,
});

describe('OAuthExcludedCard rendering', () => {
  it('shows the upgrade-required empty state when the feature is unsupported', () => {
    render(<OAuthExcludedCard {...baseProps({ excludedError: 'unsupported' })} />);

    expect(screen.getByText('Please upgrade CLI Proxy API')).toBeInTheDocument();
  });

  it('shows the empty-all message when there are no excluded providers', () => {
    render(<OAuthExcludedCard {...baseProps({ excluded: {} })} />);

    expect(
      screen.getByText('No provider model disablement yet; click “Add Disablement” to create one.')
    ).toBeInTheDocument();
  });

  it('renders the provider name for each excluded entry', () => {
    render(<OAuthExcludedCard {...baseProps({ excluded: { codex: ['gpt-4o'] } })} />);

    expect(screen.getByText('codex')).toBeInTheDocument();
  });

  it('renders the pluralized disabled model count for an entry with models', () => {
    render(<OAuthExcludedCard {...baseProps({ excluded: { codex: ['gpt-4o', 'gpt-4'] } })} />);

    expect(screen.getByText('2 models disabled')).toBeInTheDocument();
  });

  it('renders the no-models-configured message for an entry with an empty model list', () => {
    render(<OAuthExcludedCard {...baseProps({ excluded: { codex: [] } })} />);

    expect(screen.getByText('No disabled models configured')).toBeInTheDocument();
  });
});

describe('OAuthExcludedCard interactions', () => {
  it('invokes onAdd when the add button is clicked', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<OAuthExcludedCard {...baseProps({ onAdd })} />);

    await user.click(screen.getByRole('button', { name: 'Add Disablement' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('invokes onEdit with the provider name when the edit button is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<OAuthExcludedCard {...baseProps({ excluded: { codex: ['gpt-4o'] }, onEdit })} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledWith('codex');
  });

  it('invokes onDelete with the provider name when the delete button is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<OAuthExcludedCard {...baseProps({ excluded: { codex: ['gpt-4o'] }, onDelete })} />);

    await user.click(screen.getByRole('button', { name: 'Delete Provider' }));

    expect(onDelete).toHaveBeenCalledWith('codex');
  });

  it('disables the add button when controls are disabled', () => {
    render(<OAuthExcludedCard {...baseProps({ disableControls: true })} />);

    expect(screen.getByRole('button', { name: 'Add Disablement' })).toBeDisabled();
  });

  it('disables the add button when the feature is unsupported', () => {
    render(<OAuthExcludedCard {...baseProps({ excludedError: 'unsupported' })} />);

    expect(screen.getByRole('button', { name: 'Add Disablement' })).toBeDisabled();
  });
});
