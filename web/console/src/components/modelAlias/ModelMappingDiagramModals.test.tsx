import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent, within } from '@/test/utils';
import i18n from '@/i18n';
import {
  AddAliasModal,
  RenameAliasModal,
  SettingsAliasModal,
  SettingsSourceModal,
} from './ModelMappingDiagramModals';
import type { AliasNode, SourceNode } from './ModelMappingDiagramTypes';

const t = i18n.getFixedT('en');

function sourceNode(overrides: Partial<SourceNode> = {}): SourceNode {
  return {
    id: 'openai::gpt-4o',
    provider: 'openai',
    name: 'gpt-4o',
    aliases: [{ alias: 'fast', fork: false }],
    ...overrides,
  };
}

describe('RenameAliasModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders nothing when closed', () => {
    render(
      <RenameAliasModal
        open={false}
        t={t}
        value=""
        error=""
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the rename title and current value when open', () => {
    render(
      <RenameAliasModal
        open
        t={t}
        value="gpt-4o"
        error=""
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText('Rename alias')).toBeInTheDocument();
    expect(screen.getByDisplayValue('gpt-4o')).toBeInTheDocument();
  });

  it('shows the supplied error message', () => {
    render(
      <RenameAliasModal
        open
        t={t}
        value=""
        error="This alias already exists."
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText('This alias already exists.')).toBeInTheDocument();
  });

  it('emits each typed character through onChange', async () => {
    const onChange = vi.fn();
    render(
      <RenameAliasModal
        open
        t={t}
        value=""
        error=""
        onChange={onChange}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    await userEvent.type(screen.getByDisplayValue(''), 'x');

    expect(onChange).toHaveBeenCalledExactlyOnceWith('x');
  });

  it('submits when Enter is pressed in the input', async () => {
    const onSubmit = vi.fn();
    render(
      <RenameAliasModal
        open
        t={t}
        value="abc"
        error=""
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    await userEvent.type(screen.getByDisplayValue('abc'), '{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('submits when the rename footer button is clicked', async () => {
    const onSubmit = vi.fn();
    render(
      <RenameAliasModal
        open
        t={t}
        value="abc"
        error=""
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Rename' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('invokes onClose when the cancel button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <RenameAliasModal
        open
        t={t}
        value="abc"
        error=""
        onChange={vi.fn()}
        onClose={onClose}
        onSubmit={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('AddAliasModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders nothing when closed', () => {
    render(
      <AddAliasModal
        open={false}
        t={t}
        value=""
        error=""
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the add-alias title when open', () => {
    render(
      <AddAliasModal
        open
        t={t}
        value=""
        error=""
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText('Add alias')).toBeInTheDocument();
  });

  it('submits when the add footer button is clicked', async () => {
    const onSubmit = vi.fn();
    render(
      <AddAliasModal
        open
        t={t}
        value="new-alias"
        error=""
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('submits when Enter is pressed in the input', async () => {
    const onSubmit = vi.fn();
    render(
      <AddAliasModal
        open
        t={t}
        value="new-alias"
        error=""
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    await userEvent.type(screen.getByDisplayValue('new-alias'), '{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsAliasModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders nothing when closed', () => {
    render(
      <SettingsAliasModal
        open={false}
        t={t}
        alias="fast"
        aliasNodes={[]}
        onClose={vi.fn()}
        onToggleFork={vi.fn()}
        onUnlink={vi.fn()}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the alias name in the modal title', () => {
    render(
      <SettingsAliasModal
        open
        t={t}
        alias="fast"
        aliasNodes={[]}
        onClose={vi.fn()}
        onToggleFork={vi.fn()}
        onUnlink={vi.fn()}
      />
    );

    expect(screen.getByText('Alias settings — fast')).toBeInTheDocument();
  });

  it('shows the empty message when the alias has no matching node', () => {
    render(
      <SettingsAliasModal
        open
        t={t}
        alias="missing"
        aliasNodes={[]}
        onClose={vi.fn()}
        onToggleFork={vi.fn()}
        onUnlink={vi.fn()}
      />
    );

    expect(screen.getByText('No mappings for this alias yet.')).toBeInTheDocument();
  });

  it('shows the empty message when the matching node has no sources', () => {
    const node: AliasNode = { id: 'fast', alias: 'fast', sources: [] };
    render(
      <SettingsAliasModal
        open
        t={t}
        alias="fast"
        aliasNodes={[node]}
        onClose={vi.fn()}
        onToggleFork={vi.fn()}
        onUnlink={vi.fn()}
      />
    );

    expect(screen.getByText('No mappings for this alias yet.')).toBeInTheDocument();
  });

  it('renders one row per source mapped to the alias', () => {
    const node: AliasNode = {
      id: 'fast',
      alias: 'fast',
      sources: [
        sourceNode({
          id: 'openai::gpt-4o',
          name: 'gpt-4o',
          aliases: [{ alias: 'fast', fork: false }],
        }),
        sourceNode({
          id: 'openai::gpt-4',
          name: 'gpt-4',
          aliases: [{ alias: 'fast', fork: true }],
        }),
      ],
    };
    render(
      <SettingsAliasModal
        open
        t={t}
        alias="fast"
        aliasNodes={[node]}
        onClose={vi.fn()}
        onToggleFork={vi.fn()}
        onUnlink={vi.fn()}
      />
    );

    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
  });

  it('reflects the per-source fork flag on the toggle checkbox', () => {
    const node: AliasNode = {
      id: 'fast',
      alias: 'fast',
      sources: [sourceNode({ aliases: [{ alias: 'fast', fork: true }] })],
    };
    render(
      <SettingsAliasModal
        open
        t={t}
        alias="fast"
        aliasNodes={[node]}
        onClose={vi.fn()}
        onToggleFork={vi.fn()}
        onUnlink={vi.fn()}
      />
    );

    expect(screen.getByRole('checkbox', { name: 'Keep original' })).toBeChecked();
  });

  it('invokes onToggleFork with the source coordinates and new value', async () => {
    const onToggleFork = vi.fn();
    const node: AliasNode = {
      id: 'fast',
      alias: 'fast',
      sources: [
        sourceNode({
          id: 'openai::gpt-4o',
          provider: 'openai',
          name: 'gpt-4o',
          aliases: [{ alias: 'fast', fork: false }],
        }),
      ],
    };
    render(
      <SettingsAliasModal
        open
        t={t}
        alias="fast"
        aliasNodes={[node]}
        onClose={vi.fn()}
        onToggleFork={onToggleFork}
        onUnlink={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'Keep original' }));

    expect(onToggleFork).toHaveBeenCalledExactlyOnceWith('openai', 'gpt-4o', 'fast', true);
  });

  it('invokes onUnlink with the source coordinates when the delete button is clicked', async () => {
    const onUnlink = vi.fn();
    const node: AliasNode = {
      id: 'fast',
      alias: 'fast',
      sources: [
        sourceNode({
          id: 'openai::gpt-4o',
          provider: 'openai',
          name: 'gpt-4o',
          aliases: [{ alias: 'fast', fork: false }],
        }),
      ],
    };
    render(
      <SettingsAliasModal
        open
        t={t}
        alias="fast"
        aliasNodes={[node]}
        onClose={vi.fn()}
        onToggleFork={vi.fn()}
        onUnlink={onUnlink}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Unlink from openai / gpt-4o' }));

    expect(onUnlink).toHaveBeenCalledExactlyOnceWith('openai', 'gpt-4o', 'fast');
  });
});

describe('SettingsSourceModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders nothing when closed', () => {
    render(
      <SettingsSourceModal
        open={false}
        t={t}
        source={sourceNode()}
        onClose={vi.fn()}
        onToggleFork={vi.fn()}
        onUnlink={vi.fn()}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the source-settings title when open', () => {
    render(
      <SettingsSourceModal
        open
        t={t}
        source={sourceNode()}
        onClose={vi.fn()}
        onToggleFork={vi.fn()}
        onUnlink={vi.fn()}
      />
    );

    expect(screen.getByText('Source model settings')).toBeInTheDocument();
  });

  it('shows the empty message when the source has no aliases', () => {
    render(
      <SettingsSourceModal
        open
        t={t}
        source={sourceNode({ aliases: [] })}
        onClose={vi.fn()}
        onToggleFork={vi.fn()}
        onUnlink={vi.fn()}
      />
    );

    expect(screen.getByText('No mappings for this alias yet.')).toBeInTheDocument();
  });

  it('renders one row per alias the source maps to', () => {
    render(
      <SettingsSourceModal
        open
        t={t}
        source={sourceNode({
          aliases: [
            { alias: 'fast', fork: false },
            { alias: 'smart', fork: true },
          ],
        })}
        onClose={vi.fn()}
        onToggleFork={vi.fn()}
        onUnlink={vi.fn()}
      />
    );

    expect(screen.getByText('fast')).toBeInTheDocument();
    expect(screen.getByText('smart')).toBeInTheDocument();
  });

  it('reflects each alias fork flag independently', () => {
    render(
      <SettingsSourceModal
        open
        t={t}
        source={sourceNode({
          aliases: [
            { alias: 'fast', fork: false },
            { alias: 'smart', fork: true },
          ],
        })}
        onClose={vi.fn()}
        onToggleFork={vi.fn()}
        onUnlink={vi.fn()}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox', { name: 'Keep original' });
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).toBeChecked();
  });

  it('invokes onToggleFork for the specific alias row', async () => {
    const onToggleFork = vi.fn();
    render(
      <SettingsSourceModal
        open
        t={t}
        source={sourceNode({
          id: 'openai::gpt-4o',
          provider: 'openai',
          name: 'gpt-4o',
          aliases: [{ alias: 'smart', fork: true }],
        })}
        onClose={vi.fn()}
        onToggleFork={onToggleFork}
        onUnlink={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'Keep original' }));

    expect(onToggleFork).toHaveBeenCalledExactlyOnceWith('openai', 'gpt-4o', 'smart', false);
  });

  it('invokes onUnlink for the specific alias row', async () => {
    const onUnlink = vi.fn();
    render(
      <SettingsSourceModal
        open
        t={t}
        source={sourceNode({
          id: 'openai::gpt-4o',
          provider: 'openai',
          name: 'gpt-4o',
          aliases: [{ alias: 'smart', fork: true }],
        })}
        onClose={vi.fn()}
        onToggleFork={vi.fn()}
        onUnlink={onUnlink}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Unlink from openai / gpt-4o' }));

    expect(onUnlink).toHaveBeenCalledExactlyOnceWith('openai', 'gpt-4o', 'smart');
  });

  it('renders no rows for a null source', () => {
    render(
      <SettingsSourceModal
        open
        t={t}
        source={null}
        onClose={vi.fn()}
        onToggleFork={vi.fn()}
        onUnlink={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
