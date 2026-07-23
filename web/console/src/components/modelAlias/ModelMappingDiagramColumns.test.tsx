import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent, fireEvent } from '@/test/utils';
import { ProviderColumn, SourceColumn, AliasColumn } from './ModelMappingDiagramColumns';
import type { AliasNode, ProviderNode, SourceNode } from './ModelMappingDiagramTypes';

// PROVIDER_COLORS table from the source, used to compute expected colors independently.
const COLORS = [
  '#8b8680',
  '#10b981',
  '#f59e0b',
  '#c65746',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
];
const expectedColor = (provider: string): string => {
  const hash = provider.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
};

function source(overrides: Partial<SourceNode> = {}): SourceNode {
  return {
    id: 'openai::gpt-4o',
    provider: 'openai',
    name: 'gpt-4o',
    aliases: [{ alias: 'fast', fork: false }],
    ...overrides,
  };
}

describe('ProviderColumn', () => {
  function renderProviders(overrides: Partial<Parameters<typeof ProviderColumn>[0]> = {}) {
    const providerNodes: ProviderNode[] = [
      { provider: 'openai', sources: [source({ id: 'openai::a' }), source({ id: 'openai::b' })] },
      { provider: 'gemini', sources: [source({ id: 'gemini::c', provider: 'gemini' })] },
    ];
    const props = {
      providerNodes,
      collapsedProviders: new Set<string>(),
      getProviderColor: expectedColor,
      providerGroupHeights: {},
      providerRefs: { current: new Map<string, HTMLDivElement>() },
      onToggleCollapse: vi.fn(),
      onContextMenu: vi.fn(),
      label: 'Providers',
      expandLabel: 'Expand',
      collapseLabel: 'Collapse',
      ...overrides,
    };
    render(<ProviderColumn {...props} />);
    return props;
  }

  it('renders the column header label', () => {
    renderProviders();

    expect(screen.getByText('Providers')).toBeInTheDocument();
  });

  it('renders each provider name', () => {
    renderProviders();

    expect(screen.getByText('openai')).toBeInTheDocument();
    expect(screen.getByText('gemini')).toBeInTheDocument();
  });

  it('renders the source count for each provider', () => {
    renderProviders();

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('colors the provider label with the computed provider color', () => {
    renderProviders();

    const label = screen.getByText('openai');
    expect(label).toHaveStyle({ color: expectedColor('openai') });
  });

  it('labels the collapse button "Collapse" for each expanded provider', () => {
    renderProviders();

    expect(screen.getAllByRole('button', { name: 'Collapse' })).toHaveLength(2);
  });

  it('labels the collapse button "Expand" when the provider is collapsed', () => {
    renderProviders({ collapsedProviders: new Set(['openai', 'gemini']) });

    const buttons = screen.getAllByRole('button', { name: 'Expand' });
    expect(buttons).toHaveLength(2);
  });

  it('invokes onToggleCollapse with the provider when the chevron button is clicked', async () => {
    const onToggleCollapse = vi.fn();
    renderProviders({ onToggleCollapse });

    await userEvent.click(screen.getAllByRole('button', { name: 'Collapse' })[0]);

    expect(onToggleCollapse).toHaveBeenCalledExactlyOnceWith('openai');
  });

  it('applies the group height style when expanded and a height is provided', () => {
    renderProviders({ providerGroupHeights: { openai: 120 } });

    // providerItem -> providerGroup wrapper carries the inline height.
    const groupWrapper = screen.getByText('openai').parentElement?.parentElement as HTMLElement;
    expect(groupWrapper.style.height).toBe('120px');
  });

  it('omits the group height style when the provider is collapsed', () => {
    renderProviders({
      collapsedProviders: new Set(['openai']),
      providerGroupHeights: { openai: 120 },
    });

    const groupWrapper = screen.getByText('openai').parentElement?.parentElement as HTMLElement;
    expect(groupWrapper.style.height).toBe('');
  });

  it('emits a provider context menu with the provider name on right-click', () => {
    const onContextMenu = vi.fn();
    renderProviders({ onContextMenu });

    fireEvent.contextMenu(screen.getByText('openai'));

    expect(onContextMenu).toHaveBeenCalledWith(expect.anything(), 'provider', 'openai');
  });
});

describe('SourceColumn', () => {
  function renderSources(overrides: Partial<Parameters<typeof SourceColumn>[0]> = {}) {
    const providerNodes: ProviderNode[] = [
      {
        provider: 'openai',
        sources: [
          source({
            id: 'openai::gpt-4o',
            name: 'gpt-4o',
            aliases: [{ alias: 'fast', fork: false }],
          }),
          source({ id: 'openai::gpt-4', name: 'gpt-4', aliases: [] }),
        ],
      },
    ];
    const props = {
      providerNodes,
      collapsedProviders: new Set<string>(),
      sourceRefs: { current: new Map<string, HTMLDivElement>() },
      getProviderColor: expectedColor,
      selectedSourceId: null,
      onSelectSource: undefined,
      draggedSource: null,
      dropTargetSource: null,
      draggable: true,
      onDragStart: vi.fn(),
      onDragEnd: vi.fn(),
      onDragOver: vi.fn(),
      onDragLeave: vi.fn(),
      onDrop: vi.fn(),
      onContextMenu: vi.fn(),
      label: 'Source Models',
      ...overrides,
    };
    render(<SourceColumn {...props} />);
    return props;
  }

  it('renders the column header label', () => {
    renderSources();

    expect(screen.getByText('Source Models')).toBeInTheDocument();
  });

  it('renders each source model name', () => {
    renderSources();

    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
  });

  it('omits sources whose provider is collapsed', () => {
    renderSources({ collapsedProviders: new Set(['openai']) });

    expect(screen.queryByText('gpt-4o')).not.toBeInTheDocument();
    expect(screen.queryByText('gpt-4')).not.toBeInTheDocument();
  });

  it('invokes onSelectSource with the source when clicked', async () => {
    const onSelectSource = vi.fn();
    const expected = source({
      id: 'openai::gpt-4o',
      name: 'gpt-4o',
      aliases: [{ alias: 'fast', fork: false }],
    });
    renderSources({ onSelectSource });

    await userEvent.click(screen.getByText('gpt-4o'));

    expect(onSelectSource).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it('invokes onDragStart with the source on drag start', () => {
    const onDragStart = vi.fn();
    renderSources({ onDragStart });

    fireEvent.dragStart(screen.getByText('gpt-4o').closest('div[draggable]') as HTMLElement);

    expect(onDragStart).toHaveBeenCalledWith(
      expect.anything(),
      source({ id: 'openai::gpt-4o', name: 'gpt-4o', aliases: [{ alias: 'fast', fork: false }] })
    );
  });

  it('invokes onDrop with the target source on drop', () => {
    const onDrop = vi.fn();
    renderSources({ onDrop });

    fireEvent.drop(screen.getByText('gpt-4o').closest('div[draggable]') as HTMLElement);

    expect(onDrop).toHaveBeenCalledWith(
      expect.anything(),
      source({ id: 'openai::gpt-4o', name: 'gpt-4o', aliases: [{ alias: 'fast', fork: false }] })
    );
  });

  it('invokes onDragEnd on drag end', () => {
    const onDragEnd = vi.fn();
    renderSources({ onDragEnd });

    fireEvent.dragEnd(screen.getByText('gpt-4o').closest('div[draggable]') as HTMLElement);

    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });

  it('emits a source context menu with the source id on right-click', () => {
    const onContextMenu = vi.fn();
    renderSources({ onContextMenu });

    fireEvent.contextMenu(screen.getByText('gpt-4o'));

    expect(onContextMenu).toHaveBeenCalledWith(expect.anything(), 'source', 'openai::gpt-4o');
  });

  it('sets the source items draggable when draggable is true', () => {
    renderSources({ draggable: true });

    const item = screen.getByText('gpt-4o').closest('div[draggable]') as HTMLElement;
    expect(item).toHaveAttribute('draggable', 'true');
  });

  it('marks the source items non-draggable when draggable is false', () => {
    renderSources({ draggable: false });

    const item = screen.getByText('gpt-4o').closest('div[draggable]') as HTMLElement;
    expect(item).toHaveAttribute('draggable', 'false');
  });
});

describe('AliasColumn', () => {
  function renderAliases(overrides: Partial<Parameters<typeof AliasColumn>[0]> = {}) {
    const aliasNodes: AliasNode[] = [
      { id: 'fast', alias: 'fast', sources: [source(), source({ id: 'x::y' })] },
      { id: 'smart', alias: 'smart', sources: [] },
    ];
    const props = {
      aliasNodes,
      aliasRefs: { current: new Map<string, HTMLDivElement>() },
      dropTargetAlias: null,
      draggedAlias: null,
      selectedAlias: null,
      onSelectAlias: undefined,
      draggable: true,
      onDragStart: vi.fn(),
      onDragEnd: vi.fn(),
      onDragOver: vi.fn(),
      onDragLeave: vi.fn(),
      onDrop: vi.fn(),
      onContextMenu: vi.fn(),
      label: 'Aliases',
      ...overrides,
    };
    render(<AliasColumn {...props} />);
    return props;
  }

  it('renders the column header label', () => {
    renderAliases();

    expect(screen.getByText('Aliases')).toBeInTheDocument();
  });

  it('renders each alias name', () => {
    renderAliases();

    expect(screen.getByText('fast')).toBeInTheDocument();
    expect(screen.getByText('smart')).toBeInTheDocument();
  });

  it('renders the source count for each alias', () => {
    renderAliases();

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('invokes onSelectAlias with the alias when clicked', async () => {
    const onSelectAlias = vi.fn();
    renderAliases({ onSelectAlias });

    await userEvent.click(screen.getByText('fast'));

    expect(onSelectAlias).toHaveBeenCalledExactlyOnceWith('fast');
  });

  it('invokes onDragStart with the alias on drag start', () => {
    const onDragStart = vi.fn();
    renderAliases({ onDragStart });

    fireEvent.dragStart(screen.getByText('fast').closest('div[draggable]') as HTMLElement);

    expect(onDragStart).toHaveBeenCalledWith(expect.anything(), 'fast');
  });

  it('invokes onDragOver with the alias on drag over', () => {
    const onDragOver = vi.fn();
    renderAliases({ onDragOver });

    fireEvent.dragOver(screen.getByText('fast').closest('div[draggable]') as HTMLElement);

    expect(onDragOver).toHaveBeenCalledWith(expect.anything(), 'fast');
  });

  it('invokes onDrop with the alias on drop', () => {
    const onDrop = vi.fn();
    renderAliases({ onDrop });

    fireEvent.drop(screen.getByText('fast').closest('div[draggable]') as HTMLElement);

    expect(onDrop).toHaveBeenCalledWith(expect.anything(), 'fast');
  });

  it('invokes onDragLeave on drag leave', () => {
    const onDragLeave = vi.fn();
    renderAliases({ onDragLeave });

    fireEvent.dragLeave(screen.getByText('fast').closest('div[draggable]') as HTMLElement);

    expect(onDragLeave).toHaveBeenCalledTimes(1);
  });

  it('emits an alias context menu with the alias on right-click', () => {
    const onContextMenu = vi.fn();
    renderAliases({ onContextMenu });

    fireEvent.contextMenu(screen.getByText('fast'));

    expect(onContextMenu).toHaveBeenCalledWith(expect.anything(), 'alias', 'fast');
  });
});
