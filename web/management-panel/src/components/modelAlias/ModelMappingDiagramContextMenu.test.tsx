import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent } from '@/test/utils';
import i18n from '@/i18n';
import { DiagramContextMenu } from './ModelMappingDiagramContextMenu';
import type { ContextMenuState } from './ModelMappingDiagramTypes';

const t = i18n.getFixedT('en');

function makeProps(overrides: Partial<Parameters<typeof DiagramContextMenu>[0]> = {}) {
  return {
    contextMenu: null as ContextMenuState | null,
    t,
    onRequestClose: vi.fn(),
    onAddAlias: vi.fn(),
    onRenameAlias: vi.fn(),
    onOpenAliasSettings: vi.fn(),
    onDeleteAlias: vi.fn(),
    onEditProvider: vi.fn(),
    onDeleteProvider: vi.fn(),
    onOpenSourceSettings: vi.fn(),
    ...overrides
  };
}

describe('DiagramContextMenu', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders nothing when contextMenu is null', () => {
    const props = makeProps({ contextMenu: null });

    const { container } = render(<DiagramContextMenu {...props} />);

    expect(container).toBeEmptyDOMElement();
    expect(document.body.querySelector('span')).toBeNull();
  });

  it('renders only the add-alias item for a background menu', () => {
    const props = makeProps({ contextMenu: { x: 0, y: 0, type: 'background' } });

    render(<DiagramContextMenu {...props} />);

    expect(screen.getByText('Add Alias')).toBeInTheDocument();
    expect(screen.queryByText('Rename')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('renders rename, settings, and delete items for an alias menu', () => {
    const props = makeProps({ contextMenu: { x: 0, y: 0, type: 'alias', data: 'gpt-4o' } });

    render(<DiagramContextMenu {...props} />);

    expect(screen.getByText('Rename')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Delete alias')).toBeInTheDocument();
  });

  it('renders edit and delete-provider items for a provider menu', () => {
    const props = makeProps({ contextMenu: { x: 0, y: 0, type: 'provider', data: 'openai' } });

    render(<DiagramContextMenu {...props} />);

    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Delete Provider')).toBeInTheDocument();
  });

  it('renders only the settings item for a source menu', () => {
    const props = makeProps({ contextMenu: { x: 0, y: 0, type: 'source', data: 'openai::gpt-4o' } });

    render(<DiagramContextMenu {...props} />);

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.queryByText('Rename')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete alias')).not.toBeInTheDocument();
  });

  it('renders no items for an alias menu missing its data payload', () => {
    const props = makeProps({ contextMenu: { x: 0, y: 0, type: 'alias', data: undefined } });

    render(<DiagramContextMenu {...props} />);

    expect(screen.queryByText('Rename')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete alias')).not.toBeInTheDocument();
  });

  it('renders no items for a provider menu missing its data payload', () => {
    const props = makeProps({ contextMenu: { x: 0, y: 0, type: 'provider', data: undefined } });

    render(<DiagramContextMenu {...props} />);

    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete Provider')).not.toBeInTheDocument();
  });

  it('positions the menu using the provided x and y coordinates', () => {
    const props = makeProps({ contextMenu: { x: 123, y: 456, type: 'background' } });

    render(<DiagramContextMenu {...props} />);

    const menu = screen.getByText('Add Alias').closest('div[style]') as HTMLElement;
    expect(menu.style.top).toBe('456px');
    expect(menu.style.left).toBe('123px');
  });

  it('invokes onAddAlias when the add-alias item is clicked', async () => {
    const onAddAlias = vi.fn();
    const props = makeProps({ contextMenu: { x: 0, y: 0, type: 'background' }, onAddAlias });
    render(<DiagramContextMenu {...props} />);

    await userEvent.click(screen.getByText('Add Alias'));

    expect(onAddAlias).toHaveBeenCalledTimes(1);
  });

  it('invokes onRenameAlias with the alias data when rename is clicked', async () => {
    const onRenameAlias = vi.fn();
    const props = makeProps({
      contextMenu: { x: 0, y: 0, type: 'alias', data: 'gpt-4o' },
      onRenameAlias
    });
    render(<DiagramContextMenu {...props} />);

    await userEvent.click(screen.getByText('Rename'));

    expect(onRenameAlias).toHaveBeenCalledExactlyOnceWith('gpt-4o');
  });

  it('invokes onOpenAliasSettings with the alias data when settings is clicked', async () => {
    const onOpenAliasSettings = vi.fn();
    const props = makeProps({
      contextMenu: { x: 0, y: 0, type: 'alias', data: 'gpt-4o' },
      onOpenAliasSettings
    });
    render(<DiagramContextMenu {...props} />);

    await userEvent.click(screen.getByText('Settings'));

    expect(onOpenAliasSettings).toHaveBeenCalledExactlyOnceWith('gpt-4o');
  });

  it('invokes onDeleteAlias with the alias data when delete is clicked', async () => {
    const onDeleteAlias = vi.fn();
    const props = makeProps({
      contextMenu: { x: 0, y: 0, type: 'alias', data: 'gpt-4o' },
      onDeleteAlias
    });
    render(<DiagramContextMenu {...props} />);

    await userEvent.click(screen.getByText('Delete alias'));

    expect(onDeleteAlias).toHaveBeenCalledExactlyOnceWith('gpt-4o');
  });

  it('invokes onEditProvider with the provider data when edit is clicked', async () => {
    const onEditProvider = vi.fn();
    const props = makeProps({
      contextMenu: { x: 0, y: 0, type: 'provider', data: 'openai' },
      onEditProvider
    });
    render(<DiagramContextMenu {...props} />);

    await userEvent.click(screen.getByText('Edit'));

    expect(onEditProvider).toHaveBeenCalledExactlyOnceWith('openai');
  });

  it('invokes onDeleteProvider with the provider data when delete-provider is clicked', async () => {
    const onDeleteProvider = vi.fn();
    const props = makeProps({
      contextMenu: { x: 0, y: 0, type: 'provider', data: 'openai' },
      onDeleteProvider
    });
    render(<DiagramContextMenu {...props} />);

    await userEvent.click(screen.getByText('Delete Provider'));

    expect(onDeleteProvider).toHaveBeenCalledExactlyOnceWith('openai');
  });

  it('invokes onOpenSourceSettings with the source id when settings is clicked', async () => {
    const onOpenSourceSettings = vi.fn();
    const props = makeProps({
      contextMenu: { x: 0, y: 0, type: 'source', data: 'openai::gpt-4o' },
      onOpenSourceSettings
    });
    render(<DiagramContextMenu {...props} />);

    await userEvent.click(screen.getByText('Settings'));

    expect(onOpenSourceSettings).toHaveBeenCalledExactlyOnceWith('openai::gpt-4o');
  });

  it('requests close on an outside mousedown', async () => {
    const onRequestClose = vi.fn();
    const props = makeProps({
      contextMenu: { x: 0, y: 0, type: 'background' },
      onRequestClose
    });
    render(<DiagramContextMenu {...props} />);

    await userEvent.click(document.body);

    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it('does not request close on a mousedown inside the menu', async () => {
    const onRequestClose = vi.fn();
    const props = makeProps({
      contextMenu: { x: 0, y: 0, type: 'background' },
      onRequestClose
    });
    render(<DiagramContextMenu {...props} />);

    await userEvent.click(screen.getByText('Add Alias'));

    expect(onRequestClose).not.toHaveBeenCalled();
  });
});
