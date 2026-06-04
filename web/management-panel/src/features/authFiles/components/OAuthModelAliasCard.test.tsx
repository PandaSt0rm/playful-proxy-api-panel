import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/test/utils';
import { OAuthModelAliasCard, type OAuthModelAliasCardProps } from './OAuthModelAliasCard';

const baseProps = (
  overrides: Partial<OAuthModelAliasCardProps> = {}
): OAuthModelAliasCardProps => ({
  disableControls: false,
  viewMode: 'list',
  onViewModeChange: vi.fn(),
  onAdd: vi.fn(),
  onEditProvider: vi.fn(),
  onDeleteProvider: vi.fn(),
  modelAliasError: null,
  modelAlias: {},
  allProviderModels: {},
  onUpdate: vi.fn(async () => {}),
  onDeleteLink: vi.fn(),
  onToggleFork: vi.fn(async () => {}),
  onRenameAlias: vi.fn(async () => {}),
  onDeleteAlias: vi.fn(),
  ...overrides,
});

describe('OAuthModelAliasCard rendering', () => {
  it('shows the upgrade-required empty state when the feature is unsupported', () => {
    render(<OAuthModelAliasCard {...baseProps({ modelAliasError: 'unsupported' })} />);

    expect(screen.getByText('Please upgrade CLI Proxy API')).toBeInTheDocument();
  });

  it('shows the empty-all message in list mode when there are no aliases', () => {
    render(<OAuthModelAliasCard {...baseProps({ viewMode: 'list', modelAlias: {} })} />);

    expect(
      screen.getByText('No model aliases yet—use “Add Alias” to create one.')
    ).toBeInTheDocument();
  });

  it('shows the empty-all message in diagram mode when there are no aliases', () => {
    render(<OAuthModelAliasCard {...baseProps({ viewMode: 'diagram', modelAlias: {} })} />);

    expect(
      screen.getByText('No model aliases yet—use “Add Alias” to create one.')
    ).toBeInTheDocument();
  });

  it('renders the provider name for each alias entry in list mode', () => {
    render(
      <OAuthModelAliasCard
        {...baseProps({ modelAlias: { codex: [{ name: 'gpt-4o', alias: 'best' }] } })}
      />
    );

    expect(screen.getByText('codex')).toBeInTheDocument();
  });

  it('renders the pluralized alias count for a provider with mappings', () => {
    render(
      <OAuthModelAliasCard
        {...baseProps({
          modelAlias: {
            codex: [
              { name: 'gpt-4o', alias: 'best' },
              { name: 'gpt-4', alias: 'fast' },
            ],
          },
        })}
      />
    );

    expect(screen.getByText('2 aliases')).toBeInTheDocument();
  });
});

describe('OAuthModelAliasCard interactions', () => {
  it('invokes onViewModeChange with diagram when the diagram button is clicked', async () => {
    const user = userEvent.setup();
    const onViewModeChange = vi.fn();
    render(<OAuthModelAliasCard {...baseProps({ viewMode: 'list', onViewModeChange })} />);

    await user.click(screen.getByRole('button', { name: 'Diagram' }));

    expect(onViewModeChange).toHaveBeenCalledWith('diagram');
  });

  it('invokes onViewModeChange with list when the list button is clicked', async () => {
    const user = userEvent.setup();
    const onViewModeChange = vi.fn();
    render(<OAuthModelAliasCard {...baseProps({ viewMode: 'diagram', onViewModeChange })} />);

    await user.click(screen.getByRole('button', { name: 'List' }));

    expect(onViewModeChange).toHaveBeenCalledWith('list');
  });

  it('invokes onAdd when the add button is clicked', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<OAuthModelAliasCard {...baseProps({ onAdd })} />);

    await user.click(screen.getByRole('button', { name: 'Add Alias' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('invokes onEditProvider with the provider name when the list edit button is clicked', async () => {
    const user = userEvent.setup();
    const onEditProvider = vi.fn();
    render(
      <OAuthModelAliasCard
        {...baseProps({
          modelAlias: { codex: [{ name: 'gpt-4o', alias: 'best' }] },
          onEditProvider,
        })}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(onEditProvider).toHaveBeenCalledWith('codex');
  });

  it('invokes onDeleteProvider with the provider name when the list delete button is clicked', async () => {
    const user = userEvent.setup();
    const onDeleteProvider = vi.fn();
    render(
      <OAuthModelAliasCard
        {...baseProps({
          modelAlias: { codex: [{ name: 'gpt-4o', alias: 'best' }] },
          onDeleteProvider,
        })}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Delete Provider' }));

    expect(onDeleteProvider).toHaveBeenCalledWith('codex');
  });

  it('disables the add button when the feature is unsupported', () => {
    render(<OAuthModelAliasCard {...baseProps({ modelAliasError: 'unsupported' })} />);

    expect(screen.getByRole('button', { name: 'Add Alias' })).toBeDisabled();
  });
});
