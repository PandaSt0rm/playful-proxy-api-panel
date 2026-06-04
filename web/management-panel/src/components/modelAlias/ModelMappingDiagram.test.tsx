import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, userEvent, fireEvent, within, act } from '@/test/utils';
import { useThemeStore } from '@/stores';
import {
  ModelMappingDiagram,
  type ModelMappingDiagramRef
} from './ModelMappingDiagram';
import type { OAuthModelAliasEntry } from '@/types';
import type { AuthFileModelItem } from './ModelMappingDiagramTypes';

// A drag event in jsdom carries no DataTransfer; the diagram's handlers call
// e.dataTransfer.setData / set dropEffect, so we supply a stub for fireEvent.
function dataTransferStub() {
  return {
    setData: vi.fn(),
    getData: vi.fn(() => ''),
    dropEffect: 'none',
    effectAllowed: 'none'
  } as unknown as DataTransfer;
}

function fireDrag(type: 'dragStart' | 'dragOver' | 'drop' | 'dragEnd' | 'dragLeave', el: HTMLElement) {
  fireEvent[type](el, { dataTransfer: dataTransferStub() });
}

// Find the draggable item box whose visible name matches.
function itemByName(name: string): HTMLElement {
  return screen.getByText(name).closest('div[draggable]') as HTMLElement;
}

// The inner diagram container (parent of the connections <svg>) owns the
// background-type onContextMenu handler.
function backgroundContainer(container: HTMLElement): HTMLElement {
  return container.querySelector('svg')?.parentElement as HTMLElement;
}

function setCoarsePointer(coarse: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: coarse ? query.includes('coarse') : query.includes('fine'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia;
}

const baseAlias: Record<string, OAuthModelAliasEntry[]> = {
  openai: [
    { name: 'gpt-4o', alias: 'fast', fork: false },
    { name: 'gpt-4', alias: 'smart', fork: true }
  ]
};

describe('ModelMappingDiagram', () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: 'light', resolvedTheme: 'light' });
    // Default to a non-touch pointer so tap-linking stays disabled.
    setCoarsePointer(false);
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parsing and rendering', () => {
    it('renders the three column headers', () => {
      render(<ModelMappingDiagram modelAlias={baseAlias} />);

      expect(screen.getByText('Providers')).toBeInTheDocument();
      expect(screen.getByText('Source Models')).toBeInTheDocument();
      expect(screen.getByText('Aliases')).toBeInTheDocument();
    });

    it('renders a source node per distinct provider+name mapping', () => {
      render(<ModelMappingDiagram modelAlias={baseAlias} />);

      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
      expect(screen.getByText('gpt-4')).toBeInTheDocument();
    });

    it('renders an alias node per distinct alias', () => {
      render(<ModelMappingDiagram modelAlias={baseAlias} />);

      expect(screen.getByText('fast')).toBeInTheDocument();
      expect(screen.getByText('smart')).toBeInTheDocument();
    });

    it('renders the provider name with its source count', () => {
      render(<ModelMappingDiagram modelAlias={baseAlias} />);

      const providerLabel = screen.getByText('openai');
      const providerItem = providerLabel.parentElement as HTMLElement;
      expect(within(providerItem).getByText('2')).toBeInTheDocument();
    });

    it('drops mappings with an empty name', () => {
      render(<ModelMappingDiagram modelAlias={{ openai: [{ name: '', alias: 'orphan', fork: false }] }} />);

      expect(screen.queryByText('orphan')).not.toBeInTheDocument();
    });

    it('drops mappings with an empty alias', () => {
      render(<ModelMappingDiagram modelAlias={{ openai: [{ name: 'gpt-4o', alias: '   ', fork: false }] }} />);

      expect(screen.queryByText('gpt-4o')).not.toBeInTheDocument();
    });

    it('merges duplicate provider+name mappings into a single source node', () => {
      const dup: Record<string, OAuthModelAliasEntry[]> = {
        openai: [
          { name: 'gpt-4o', alias: 'fast', fork: false },
          { name: 'GPT-4O', alias: 'fast', fork: false }
        ]
      };
      render(<ModelMappingDiagram modelAlias={dup} />);

      // Case-insensitive key collapses both into one source row (first-seen casing).
      expect(screen.getAllByText('gpt-4o')).toHaveLength(1);
    });

    it('includes unmapped models from allProviderModels with a zero alias count source', () => {
      const allProviderModels: Record<string, AuthFileModelItem[]> = {
        openai: [{ id: 'gpt-unmapped' }]
      };
      render(<ModelMappingDiagram modelAlias={{}} allProviderModels={allProviderModels} />);

      expect(screen.getByText('gpt-unmapped')).toBeInTheDocument();
    });

    it('does not duplicate a source already present from mappings when listed in allProviderModels', () => {
      const allProviderModels: Record<string, AuthFileModelItem[]> = {
        openai: [{ id: 'gpt-4o' }]
      };
      render(<ModelMappingDiagram modelAlias={baseAlias} allProviderModels={allProviderModels} />);

      expect(screen.getAllByText('gpt-4o')).toHaveLength(1);
    });

    it('renders the alias source count reflecting how many sources map to it', () => {
      const shared: Record<string, OAuthModelAliasEntry[]> = {
        openai: [
          { name: 'gpt-4o', alias: 'fast', fork: false },
          { name: 'gpt-4', alias: 'fast', fork: false }
        ]
      };
      render(<ModelMappingDiagram modelAlias={shared} />);

      const aliasLabel = screen.getByText('fast');
      const aliasItem = aliasLabel.parentElement as HTMLElement;
      expect(within(aliasItem).getByText('2')).toBeInTheDocument();
    });

    it('renders nothing in the source column when given empty inputs', () => {
      render(<ModelMappingDiagram modelAlias={{}} />);

      expect(screen.queryByText('openai')).not.toBeInTheDocument();
      expect(screen.getByText('Source Models')).toBeInTheDocument();
    });

    it('tolerates a null mappings array for a provider', () => {
      render(
        <ModelMappingDiagram
          modelAlias={{ openai: null as unknown as OAuthModelAliasEntry[] }}
        />
      );

      expect(screen.getByText('Providers')).toBeInTheDocument();
    });

    it('hides the tap hint when pointer is not coarse', () => {
      render(<ModelMappingDiagram modelAlias={baseAlias} onUpdate={vi.fn()} />);

      expect(
        screen.queryByText('On touch devices: tap a source model, then tap an alias to link.')
      ).not.toBeInTheDocument();
    });
  });

  describe('drag and drop linking', () => {
    it('calls onUpdate with the source coordinates and target alias on a source->alias drop', () => {
      const onUpdate = vi.fn();
      render(<ModelMappingDiagram modelAlias={baseAlias} onUpdate={onUpdate} />);

      fireDrag('dragStart', itemByName('gpt-4o'));
      fireDrag('drop', itemByName('smart'));

      expect(onUpdate).toHaveBeenCalledExactlyOnceWith('openai', 'gpt-4o', 'smart');
    });

    it('does not call onUpdate when dropping a source onto an alias it already maps to', () => {
      const onUpdate = vi.fn();
      render(<ModelMappingDiagram modelAlias={baseAlias} onUpdate={onUpdate} />);

      fireDrag('dragStart', itemByName('gpt-4o'));
      fireDrag('drop', itemByName('fast'));

      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('calls onUpdate with the target source and dragged alias on an alias->source drop', () => {
      const onUpdate = vi.fn();
      render(<ModelMappingDiagram modelAlias={baseAlias} onUpdate={onUpdate} />);

      fireDrag('dragStart', itemByName('smart'));
      fireDrag('drop', itemByName('gpt-4o'));

      expect(onUpdate).toHaveBeenCalledExactlyOnceWith('openai', 'gpt-4o', 'smart');
    });

    it('does not call onUpdate on alias->source drop when the source already has that alias', () => {
      const onUpdate = vi.fn();
      render(<ModelMappingDiagram modelAlias={baseAlias} onUpdate={onUpdate} />);

      fireDrag('dragStart', itemByName('fast'));
      fireDrag('drop', itemByName('gpt-4o'));

      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('renders source items as non-draggable when onUpdate is omitted', () => {
      render(<ModelMappingDiagram modelAlias={baseAlias} />);

      expect(itemByName('gpt-4o')).toHaveAttribute('draggable', 'false');
    });

    it('renders source items as draggable when onUpdate is provided', () => {
      render(<ModelMappingDiagram modelAlias={baseAlias} onUpdate={vi.fn()} />);

      expect(itemByName('gpt-4o')).toHaveAttribute('draggable', 'true');
    });
  });

  describe('tap-to-link on coarse pointers', () => {
    beforeEach(() => {
      setCoarsePointer(true);
    });

    it('shows the tap hint when pointer is coarse and onUpdate is set', () => {
      render(<ModelMappingDiagram modelAlias={baseAlias} onUpdate={vi.fn()} />);

      expect(
        screen.getByText('On touch devices: tap a source model, then tap an alias to link.')
      ).toBeInTheDocument();
    });

    it('links a tapped source to a subsequently tapped alias via onUpdate', async () => {
      const onUpdate = vi.fn();
      render(<ModelMappingDiagram modelAlias={baseAlias} onUpdate={onUpdate} />);

      await userEvent.click(itemByName('gpt-4o'));
      await userEvent.click(itemByName('smart'));

      expect(onUpdate).toHaveBeenCalledExactlyOnceWith('openai', 'gpt-4o', 'smart');
    });

    it('links a tapped alias to a subsequently tapped source via onUpdate', async () => {
      const onUpdate = vi.fn();
      render(<ModelMappingDiagram modelAlias={baseAlias} onUpdate={onUpdate} />);

      await userEvent.click(itemByName('smart'));
      await userEvent.click(itemByName('gpt-4o'));

      expect(onUpdate).toHaveBeenCalledExactlyOnceWith('openai', 'gpt-4o', 'smart');
    });

    it('does not link when the same source is tapped twice', async () => {
      const onUpdate = vi.fn();
      render(<ModelMappingDiagram modelAlias={baseAlias} onUpdate={onUpdate} />);

      await userEvent.click(itemByName('gpt-4o'));
      await userEvent.click(itemByName('gpt-4o'));

      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  describe('context menu', () => {
    it('opens the background menu with an Add Alias action on container right-click', () => {
      const { container } = render(<ModelMappingDiagram modelAlias={baseAlias} />);

      fireEvent.contextMenu(backgroundContainer(container));

      expect(screen.getByText('Add Alias')).toBeInTheDocument();
    });

    it('opens the alias menu with rename, settings, and delete on alias right-click', () => {
      render(<ModelMappingDiagram modelAlias={baseAlias} />);

      fireEvent.contextMenu(screen.getByText('fast'));

      expect(screen.getByText('Rename')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByText('Delete alias')).toBeInTheDocument();
    });

    it('opens the provider menu with edit and delete on provider right-click', () => {
      render(<ModelMappingDiagram modelAlias={baseAlias} />);

      fireEvent.contextMenu(screen.getByText('openai'));

      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.getByText('Delete Provider')).toBeInTheDocument();
    });

    it('calls onEditProvider with the provider when the edit action is clicked', async () => {
      const onEditProvider = vi.fn();
      render(<ModelMappingDiagram modelAlias={baseAlias} onEditProvider={onEditProvider} />);

      fireEvent.contextMenu(screen.getByText('openai'));
      await userEvent.click(screen.getByText('Edit'));

      expect(onEditProvider).toHaveBeenCalledExactlyOnceWith('openai');
    });

    it('calls onDeleteProvider with the provider when the delete action is clicked', async () => {
      const onDeleteProvider = vi.fn();
      render(<ModelMappingDiagram modelAlias={baseAlias} onDeleteProvider={onDeleteProvider} />);

      fireEvent.contextMenu(screen.getByText('openai'));
      await userEvent.click(screen.getByText('Delete Provider'));

      expect(onDeleteProvider).toHaveBeenCalledExactlyOnceWith('openai');
    });

    it('opens the source settings modal from the source context menu', async () => {
      render(<ModelMappingDiagram modelAlias={baseAlias} />);

      fireEvent.contextMenu(screen.getByText('gpt-4o'));
      await userEvent.click(screen.getByText('Settings'));

      expect(screen.getByText('Source model settings')).toBeInTheDocument();
    });

    it('opens the alias settings modal from the alias context menu', async () => {
      render(<ModelMappingDiagram modelAlias={baseAlias} />);

      fireEvent.contextMenu(screen.getByText('fast'));
      await userEvent.click(screen.getByText('Settings'));

      expect(screen.getByText('Alias settings — fast')).toBeInTheDocument();
    });
  });

  describe('add alias modal', () => {
    it('opens the add alias modal from the background menu', async () => {
      const { container } = render(<ModelMappingDiagram modelAlias={baseAlias} />);

      fireEvent.contextMenu(backgroundContainer(container));
      await userEvent.click(screen.getByText('Add Alias'));

      expect(screen.getByText('Add alias')).toBeInTheDocument();
    });

    it('shows a validation error when submitting an empty alias name', async () => {
      const { container } = render(<ModelMappingDiagram modelAlias={baseAlias} />);

      fireEvent.contextMenu(backgroundContainer(container));
      await userEvent.click(screen.getByText('Add Alias'));
      await userEvent.click(screen.getByRole('button', { name: 'Add' }));

      expect(screen.getByText('Please enter an alias name.')).toBeInTheDocument();
    });

    it('shows a duplicate error when adding an alias that already exists', async () => {
      const { container } = render(<ModelMappingDiagram modelAlias={baseAlias} />);

      fireEvent.contextMenu(backgroundContainer(container));
      await userEvent.click(screen.getByText('Add Alias'));
      await userEvent.type(screen.getByLabelText('Alias name'), 'fast');
      await userEvent.click(screen.getByRole('button', { name: 'Add' }));

      expect(screen.getByText('This alias already exists.')).toBeInTheDocument();
    });

    it('adds a new alias node to the alias column on a valid submit', async () => {
      const { container } = render(<ModelMappingDiagram modelAlias={baseAlias} />);

      fireEvent.contextMenu(backgroundContainer(container));
      await userEvent.click(screen.getByText('Add Alias'));
      await userEvent.type(screen.getByLabelText('Alias name'), 'brand-new');
      await userEvent.click(screen.getByRole('button', { name: 'Add' }));

      expect(screen.getByText('brand-new')).toBeInTheDocument();
    });
  });

  describe('rename alias modal', () => {
    it('opens prefilled with the current alias name', async () => {
      render(<ModelMappingDiagram modelAlias={baseAlias} />);

      fireEvent.contextMenu(screen.getByText('fast'));
      await userEvent.click(screen.getByText('Rename'));

      expect(screen.getByDisplayValue('fast')).toBeInTheDocument();
    });

    it('calls onRenameAlias with the old and new names on a valid submit', async () => {
      const onRenameAlias = vi.fn();
      render(<ModelMappingDiagram modelAlias={baseAlias} onRenameAlias={onRenameAlias} />);

      fireEvent.contextMenu(screen.getByText('fast'));
      await userEvent.click(screen.getByText('Rename'));
      await userEvent.clear(screen.getByLabelText('New alias name'));
      await userEvent.type(screen.getByLabelText('New alias name'), 'turbo');
      await userEvent.click(screen.getByRole('button', { name: 'Rename' }));

      expect(onRenameAlias).toHaveBeenCalledExactlyOnceWith('fast', 'turbo');
    });

    it('does not call onRenameAlias when the name is unchanged', async () => {
      const onRenameAlias = vi.fn();
      render(<ModelMappingDiagram modelAlias={baseAlias} onRenameAlias={onRenameAlias} />);

      fireEvent.contextMenu(screen.getByText('fast'));
      await userEvent.click(screen.getByText('Rename'));
      await userEvent.click(screen.getByRole('button', { name: 'Rename' }));

      expect(onRenameAlias).not.toHaveBeenCalled();
    });

    it('shows a duplicate error and does not rename when the new name collides', async () => {
      const onRenameAlias = vi.fn();
      render(<ModelMappingDiagram modelAlias={baseAlias} onRenameAlias={onRenameAlias} />);

      fireEvent.contextMenu(screen.getByText('fast'));
      await userEvent.click(screen.getByText('Rename'));
      await userEvent.clear(screen.getByLabelText('New alias name'));
      await userEvent.type(screen.getByLabelText('New alias name'), 'smart');
      await userEvent.click(screen.getByRole('button', { name: 'Rename' }));

      expect(screen.getByText('This alias already exists.')).toBeInTheDocument();
      expect(onRenameAlias).not.toHaveBeenCalled();
    });

    it('shows an empty-name error when the rename field is cleared', async () => {
      render(<ModelMappingDiagram modelAlias={baseAlias} onRenameAlias={vi.fn()} />);

      fireEvent.contextMenu(screen.getByText('fast'));
      await userEvent.click(screen.getByText('Rename'));
      await userEvent.clear(screen.getByLabelText('New alias name'));
      await userEvent.click(screen.getByRole('button', { name: 'Rename' }));

      expect(screen.getByText('Please enter an alias name.')).toBeInTheDocument();
    });
  });

  describe('delete alias', () => {
    it('calls onDeleteAlias for an alias that still has mapped sources', async () => {
      const onDeleteAlias = vi.fn();
      render(<ModelMappingDiagram modelAlias={baseAlias} onDeleteAlias={onDeleteAlias} />);

      fireEvent.contextMenu(screen.getByText('fast'));
      await userEvent.click(screen.getByText('Delete alias'));

      expect(onDeleteAlias).toHaveBeenCalledExactlyOnceWith('fast');
    });

    it('removes a sourceless extra alias locally without calling onDeleteAlias', async () => {
      const onDeleteAlias = vi.fn();
      const { container } = render(
        <ModelMappingDiagram modelAlias={baseAlias} onDeleteAlias={onDeleteAlias} />
      );

      fireEvent.contextMenu(backgroundContainer(container));
      await userEvent.click(screen.getByText('Add Alias'));
      await userEvent.type(screen.getByLabelText('Alias name'), 'temp');
      await userEvent.click(screen.getByRole('button', { name: 'Add' }));

      fireEvent.contextMenu(screen.getByText('temp'));
      await userEvent.click(screen.getByText('Delete alias'));

      expect(screen.queryByText('temp')).not.toBeInTheDocument();
      expect(onDeleteAlias).not.toHaveBeenCalled();
    });
  });

  describe('settings modal callbacks', () => {
    it('calls onToggleFork from the alias settings modal toggle', async () => {
      const onToggleFork = vi.fn();
      render(<ModelMappingDiagram modelAlias={baseAlias} onToggleFork={onToggleFork} />);

      fireEvent.contextMenu(screen.getByText('fast'));
      await userEvent.click(screen.getByText('Settings'));
      await userEvent.click(screen.getByRole('checkbox', { name: 'Keep original' }));

      expect(onToggleFork).toHaveBeenCalledExactlyOnceWith('openai', 'gpt-4o', 'fast', true);
    });

    it('calls onDeleteLink from the alias settings modal unlink button', async () => {
      const onDeleteLink = vi.fn();
      render(<ModelMappingDiagram modelAlias={baseAlias} onDeleteLink={onDeleteLink} />);

      fireEvent.contextMenu(screen.getByText('fast'));
      await userEvent.click(screen.getByText('Settings'));
      await userEvent.click(screen.getByRole('button', { name: 'Unlink from openai / gpt-4o' }));

      expect(onDeleteLink).toHaveBeenCalledExactlyOnceWith('openai', 'gpt-4o', 'fast');
    });

    it('calls onToggleFork from the source settings modal toggle', async () => {
      const onToggleFork = vi.fn();
      render(<ModelMappingDiagram modelAlias={baseAlias} onToggleFork={onToggleFork} />);

      fireEvent.contextMenu(screen.getByText('gpt-4'));
      await userEvent.click(screen.getByText('Settings'));
      await userEvent.click(screen.getByRole('checkbox', { name: 'Keep original' }));

      // gpt-4 -> smart was created with fork: true, so toggling sends false.
      expect(onToggleFork).toHaveBeenCalledExactlyOnceWith('openai', 'gpt-4', 'smart', false);
    });
  });

  describe('imperative ref', () => {
    it('collapses every provider when collapseAll is invoked', () => {
      const ref = createRef<ModelMappingDiagramRef>();
      render(<ModelMappingDiagram ref={ref} modelAlias={baseAlias} />);

      expect(screen.getByText('gpt-4o')).toBeInTheDocument();

      act(() => ref.current?.collapseAll());

      expect(screen.queryByText('gpt-4o')).not.toBeInTheDocument();
    });

    it('exposes a refreshLayout method that does not throw', () => {
      const ref = createRef<ModelMappingDiagramRef>();
      render(<ModelMappingDiagram ref={ref} modelAlias={baseAlias} />);

      expect(() => act(() => ref.current?.refreshLayout())).not.toThrow();
    });
  });

  describe('provider collapse', () => {
    it('hides provider sources after clicking its collapse button', async () => {
      render(<ModelMappingDiagram modelAlias={baseAlias} />);

      await userEvent.click(screen.getByRole('button', { name: 'Collapse' }));

      expect(screen.queryByText('gpt-4o')).not.toBeInTheDocument();
    });
  });
});
