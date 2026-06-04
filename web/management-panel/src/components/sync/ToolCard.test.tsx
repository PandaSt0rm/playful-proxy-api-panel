import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent, within } from '@/test/utils';
import { ToolCard, type ToolCardConfig } from './ToolCard';
import type { ModelGroup } from './modelGrouping';
import type { SelectOption } from '@/components/ui/Select';

function makeConfig(overrides: Partial<ToolCardConfig> = {}): ToolCardConfig {
  return {
    modelFilter: '',
    modelFilterMode: 'list',
    modelFilterChips: [],
    apiKeyIndex: '',
    activeModel: '',
    collapsed: false,
    ...overrides,
  };
}

const NO_GROUPS: ModelGroup[] = [];
const NO_KEYS: SelectOption[] = [{ value: '', label: 'Default (first key)' }];

function renderCard(props: Partial<Parameters<typeof ToolCard>[0]> = {}) {
  const handlers = {
    onToggleSelected: vi.fn(),
    onToggleCollapsed: vi.fn(),
    onChange: vi.fn(),
    onRequestModeSwitch: vi.fn(),
  };
  const result = render(
    <ToolCard
      toolId="codex"
      selected={false}
      config={makeConfig()}
      groups={NO_GROUPS}
      apiKeyOptions={NO_KEYS}
      configsLoading={false}
      disabled={false}
      {...handlers}
      {...props}
    />
  );
  return { ...result, ...handlers };
}

describe('ToolCard', () => {
  describe('unselected slim row', () => {
    it('renders the translated tool label', () => {
      renderCard({ toolId: 'codex', selected: false });

      expect(screen.getByText('Codex')).toBeInTheDocument();
    });

    it('renders an unchecked checkbox when not selected', () => {
      renderCard({ selected: false });

      expect(screen.getByRole('checkbox')).not.toBeChecked();
    });

    it('does not render the active model picker when unselected', () => {
      renderCard({ selected: false });

      expect(screen.queryByText('Active model')).not.toBeInTheDocument();
    });

    it('invokes onToggleSelected with the toolId when the slim checkbox is toggled', async () => {
      const { onToggleSelected } = renderCard({ toolId: 'aider', selected: false });

      await userEvent.click(screen.getByRole('checkbox'));

      expect(onToggleSelected).toHaveBeenCalledTimes(1);
      expect(onToggleSelected).toHaveBeenCalledWith('aider');
    });

    it('does not invoke onToggleSelected when disabled and clicked', async () => {
      const { onToggleSelected } = renderCard({ selected: false, disabled: true });

      await userEvent.click(screen.getByRole('checkbox'));

      expect(onToggleSelected).not.toHaveBeenCalled();
    });

    it('falls back to the raw toolId for an unknown tool', () => {
      renderCard({
        // an id not present in SYNC_TOOLS exercises the toolLabel fallback
        toolId: 'mystery-tool' as never,
        selected: false,
      });

      expect(screen.getByText('mystery-tool')).toBeInTheDocument();
    });
  });

  describe('selected expanded card', () => {
    it('renders a checked checkbox when selected', () => {
      renderCard({ selected: true });

      expect(screen.getByRole('checkbox')).toBeChecked();
    });

    it('renders the Active model, Model filter and API key field labels', () => {
      renderCard({ selected: true });

      expect(screen.getByText('Active model')).toBeInTheDocument();
      expect(screen.getByText('Model filter (regex)')).toBeInTheDocument();
      expect(screen.getByText('API key')).toBeInTheDocument();
    });

    it('invokes onToggleSelected when the header checkbox is unchecked', async () => {
      const { onToggleSelected } = renderCard({ toolId: 'hermes', selected: true });

      await userEvent.click(screen.getByRole('checkbox'));

      expect(onToggleSelected).toHaveBeenCalledTimes(1);
      expect(onToggleSelected).toHaveBeenCalledWith('hermes');
    });

    it('shows the Collapse aria-label on the collapse button when expanded', () => {
      renderCard({ selected: true, config: makeConfig({ collapsed: false }) });

      expect(screen.getByRole('button', { name: 'Collapse configuration' })).toBeInTheDocument();
    });

    it('shows the Expand aria-label on the collapse button when collapsed', () => {
      renderCard({ selected: true, config: makeConfig({ collapsed: true }) });

      expect(screen.getByRole('button', { name: 'Expand configuration' })).toBeInTheDocument();
    });

    it('hides the body fields when collapsed', () => {
      renderCard({ selected: true, config: makeConfig({ collapsed: true }) });

      expect(screen.queryByText('Active model')).not.toBeInTheDocument();
    });

    it('invokes onToggleCollapsed with the toolId when the collapse button is clicked', async () => {
      const { onToggleCollapsed } = renderCard({ toolId: 'cursor', selected: true });

      await userEvent.click(screen.getByRole('button', { name: 'Collapse configuration' }));

      expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
      expect(onToggleCollapsed).toHaveBeenCalledWith('cursor');
    });
  });

  describe('model filter mode switching', () => {
    it('marks the list tab as selected in list mode', () => {
      renderCard({ selected: true, config: makeConfig({ modelFilterMode: 'list' }) });

      expect(screen.getByRole('tab', { name: 'Pick models' })).toHaveAttribute('aria-selected', 'true');
    });

    it('marks the regex tab as selected in regex mode', () => {
      renderCard({ selected: true, config: makeConfig({ modelFilterMode: 'regex' }) });

      expect(screen.getByRole('tab', { name: 'Regex (advanced)' })).toHaveAttribute('aria-selected', 'true');
    });

    it('requests a switch to regex mode when the regex tab is clicked', async () => {
      const { onRequestModeSwitch } = renderCard({
        toolId: 'codex',
        selected: true,
        config: makeConfig({ modelFilterMode: 'list' }),
      });

      await userEvent.click(screen.getByRole('tab', { name: 'Regex (advanced)' }));

      expect(onRequestModeSwitch).toHaveBeenCalledTimes(1);
      expect(onRequestModeSwitch).toHaveBeenCalledWith('codex', 'regex');
    });

    it('requests a switch to list mode when the list tab is clicked', async () => {
      const { onRequestModeSwitch } = renderCard({
        toolId: 'codex',
        selected: true,
        config: makeConfig({ modelFilterMode: 'regex' }),
      });

      await userEvent.click(screen.getByRole('tab', { name: 'Pick models' }));

      expect(onRequestModeSwitch).toHaveBeenCalledWith('codex', 'list');
    });

    it('renders the regex text input with the current modelFilter value in regex mode', () => {
      renderCard({
        selected: true,
        config: makeConfig({ modelFilterMode: 'regex', modelFilter: '^gpt-.*' }),
      });

      expect(screen.getByDisplayValue('^gpt-.*')).toBeInTheDocument();
    });

    it('emits a modelFilter patch as the regex input is edited', async () => {
      const { onChange } = renderCard({
        toolId: 'codex',
        selected: true,
        config: makeConfig({ modelFilterMode: 'regex', modelFilter: '' }),
      });

      await userEvent.type(screen.getByPlaceholderText('e.g., ^gpt-.*'), 'x');

      expect(onChange).toHaveBeenCalledWith('codex', { modelFilter: 'x' });
    });

    it('renders the model picker trigger instead of the regex input in list mode', () => {
      renderCard({ selected: true, config: makeConfig({ modelFilterMode: 'list' }) });

      expect(screen.queryByPlaceholderText('e.g., ^gpt-.*')).not.toBeInTheDocument();
    });
  });

  describe('active model picker', () => {
    it('shows the placeholder text on the active model trigger when no model is set', () => {
      renderCard({
        selected: true,
        config: makeConfig({ activeModel: '' }),
        configsLoading: false,
      });

      expect(
        screen.getByRole('button', { name: 'Active model' })
      ).toHaveTextContent('None (use first available)');
    });

    it('shows the selected active model on the trigger label', () => {
      renderCard({
        selected: true,
        config: makeConfig({ activeModel: 'gpt-4o' }),
      });

      expect(screen.getByRole('button', { name: 'Active model' })).toHaveTextContent('gpt-4o');
    });
  });

  describe('api key select', () => {
    it('disables the API key select while configs are loading', () => {
      renderCard({ selected: true, configsLoading: true });

      const apiKeyGroup = screen.getByText('API key').closest('div');
      expect(within(apiKeyGroup as HTMLElement).getByRole('button')).toBeDisabled();
    });
  });
});
