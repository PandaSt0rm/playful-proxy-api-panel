import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent, waitFor, within } from '@/test/utils';
import { ModelPicker } from './ModelPicker';
import type { ModelGroup } from './modelGrouping';

const GROUPS: ModelGroup[] = [
  {
    key: 'oauth:claude',
    label: 'Claude (OAuth)',
    sublabel: '2 accounts · claude',
    models: ['claude-opus-4', 'claude-sonnet-4'],
  },
  {
    key: 'provider:codex-api-key:',
    label: 'Codex (API key)',
    sublabel: 'codex-api-key',
    models: ['gpt-5', 'gpt-5-mini'],
  },
];

function getTrigger(): HTMLElement {
  // The trigger is the only button advertising a popup dialog; chip "Remove"
  // buttons and option rows do not carry aria-haspopup.
  const trigger = document.querySelector('button[aria-haspopup="dialog"]');
  if (!(trigger instanceof HTMLElement)) {
    throw new Error('ModelPicker trigger not found');
  }
  return trigger;
}

async function openPicker() {
  await userEvent.click(getTrigger());
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
}

describe('ModelPicker — active (single-select) mode', () => {
  it('shows the placeholder when no value is selected', () => {
    render(
      <ModelPicker
        mode="active"
        value=""
        onChange={vi.fn()}
        groups={GROUPS}
        placeholder="Pick one"
      />
    );

    expect(screen.getByRole('button')).toHaveTextContent('Pick one');
  });

  it('falls back to the default "Select model" label when no value or placeholder', () => {
    render(<ModelPicker mode="active" value="" onChange={vi.fn()} groups={GROUPS} />);

    expect(screen.getByRole('button')).toHaveTextContent('Select model');
  });

  it('shows the selected model id as the trigger label', () => {
    render(<ModelPicker mode="active" value="gpt-5" onChange={vi.fn()} groups={GROUPS} />);

    expect(screen.getByRole('button')).toHaveTextContent('gpt-5');
  });

  it('opens the popover dialog when the trigger is clicked', async () => {
    render(
      <ModelPicker
        mode="active"
        value=""
        onChange={vi.fn()}
        groups={GROUPS}
        ariaLabel="Active model"
      />
    );

    await openPicker();

    expect(screen.getByRole('dialog', { name: 'Active model' })).toBeInTheDocument();
  });

  it('renders all group labels and model rows when open', async () => {
    render(<ModelPicker mode="active" value="" onChange={vi.fn()} groups={GROUPS} />);

    await openPicker();

    expect(screen.getByText('Claude (OAuth)')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'claude-opus-4' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'gpt-5-mini' })).toBeInTheDocument();
  });

  it('calls onChange with the chosen model id when a row is clicked', async () => {
    const onChange = vi.fn();
    render(<ModelPicker mode="active" value="" onChange={onChange} groups={GROUPS} />);
    await openPicker();

    await userEvent.click(screen.getByRole('option', { name: 'claude-sonnet-4' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('claude-sonnet-4');
  });

  it('closes the popover after selecting a model in active mode', async () => {
    render(<ModelPicker mode="active" value="" onChange={vi.fn()} groups={GROUPS} />);
    await openPicker();

    await userEvent.click(screen.getByRole('option', { name: 'gpt-5' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('marks the currently selected option as aria-selected', async () => {
    render(<ModelPicker mode="active" value="gpt-5" onChange={vi.fn()} groups={GROUPS} />);

    await openPicker();

    expect(screen.getByRole('option', { name: 'gpt-5', selected: true })).toBeInTheDocument();
  });

  it('does not open the popover when disabled', async () => {
    render(<ModelPicker mode="active" value="" onChange={vi.fn()} groups={GROUPS} disabled />);

    await userEvent.click(screen.getByRole('button'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('ModelPicker — search filtering', () => {
  it('filters rows to those matching the query', async () => {
    render(<ModelPicker mode="active" value="" onChange={vi.fn()} groups={GROUPS} />);
    await openPicker();

    await userEvent.type(screen.getByRole('searchbox'), 'mini');

    expect(screen.getByRole('option', { name: 'gpt-5-mini' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'claude-opus-4' })).not.toBeInTheDocument();
  });

  it('matches case-insensitively', async () => {
    render(<ModelPicker mode="active" value="" onChange={vi.fn()} groups={GROUPS} />);
    await openPicker();

    await userEvent.type(screen.getByRole('searchbox'), 'GPT-5-MINI');

    expect(screen.getByRole('option', { name: 'gpt-5-mini' })).toBeInTheDocument();
  });

  it('keeps every model in a group when the query matches the group label', async () => {
    render(<ModelPicker mode="active" value="" onChange={vi.fn()} groups={GROUPS} />);
    await openPicker();

    await userEvent.type(screen.getByRole('searchbox'), 'codex');

    expect(screen.getByRole('option', { name: 'gpt-5' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'gpt-5-mini' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'claude-opus-4' })).not.toBeInTheDocument();
  });

  it('shows the empty hint when no model matches the query', async () => {
    render(
      <ModelPicker
        mode="active"
        value=""
        onChange={vi.fn()}
        groups={GROUPS}
        emptyHint="Nothing here"
      />
    );
    await openPicker();

    await userEvent.type(screen.getByRole('searchbox'), 'zzzzz');

    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });
});

describe('ModelPicker — loading and empty states', () => {
  it('shows a loading indicator when loading is true', async () => {
    render(<ModelPicker mode="active" value="" onChange={vi.fn()} groups={GROUPS} loading />);

    await openPicker();

    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows the default empty hint when there are no groups', async () => {
    render(<ModelPicker mode="active" value="" onChange={vi.fn()} groups={[]} />);

    await openPicker();

    expect(screen.getByText('No models found')).toBeInTheDocument();
  });
});

describe('ModelPicker — filter-list (multi-select) mode', () => {
  it('shows the add-models placeholder when nothing is selected', () => {
    render(
      <ModelPicker
        mode="filter-list"
        values={[]}
        onChange={vi.fn()}
        groups={GROUPS}
        placeholder="Add models"
      />
    );

    expect(screen.getByRole('button', { name: /Add models/ })).toBeInTheDocument();
  });

  it('shows a singular count label when exactly one model is selected', () => {
    render(
      <ModelPicker mode="filter-list" values={['gpt-5']} onChange={vi.fn()} groups={GROUPS} />
    );

    expect(screen.getByRole('button', { name: /1 model selected/ })).toBeInTheDocument();
  });

  it('shows a plural count label when multiple models are selected', () => {
    render(
      <ModelPicker
        mode="filter-list"
        values={['gpt-5', 'gpt-5-mini']}
        onChange={vi.fn()}
        groups={GROUPS}
      />
    );

    expect(screen.getByRole('button', { name: /2 models selected/ })).toBeInTheDocument();
  });

  it('renders each selected value as a chip', () => {
    render(
      <ModelPicker
        mode="filter-list"
        values={['gpt-5', 'claude-opus-4']}
        onChange={vi.fn()}
        groups={GROUPS}
      />
    );

    expect(screen.getByLabelText('Remove gpt-5')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove claude-opus-4')).toBeInTheDocument();
  });

  it('renders model rows as checkboxes in filter-list mode', async () => {
    render(<ModelPicker mode="filter-list" values={[]} onChange={vi.fn()} groups={GROUPS} />);

    await openPicker();

    expect(screen.getByRole('checkbox', { name: 'gpt-5' })).toBeInTheDocument();
  });

  it('adds a model to the selection when an unchecked row is clicked', async () => {
    const onChange = vi.fn();
    render(
      <ModelPicker mode="filter-list" values={['gpt-5']} onChange={onChange} groups={GROUPS} />
    );
    await openPicker();

    await userEvent.click(screen.getByRole('checkbox', { name: 'claude-opus-4' }));

    expect(onChange).toHaveBeenCalledWith(['gpt-5', 'claude-opus-4']);
  });

  it('removes a model from the selection when a checked row is clicked', async () => {
    const onChange = vi.fn();
    render(
      <ModelPicker
        mode="filter-list"
        values={['gpt-5', 'gpt-5-mini']}
        onChange={onChange}
        groups={GROUPS}
      />
    );
    await openPicker();

    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('checkbox', { name: 'gpt-5' })
    );

    expect(onChange).toHaveBeenCalledWith(['gpt-5-mini']);
  });

  it('keeps the popover open after toggling a model in filter-list mode', async () => {
    render(<ModelPicker mode="filter-list" values={[]} onChange={vi.fn()} groups={GROUPS} />);
    await openPicker();

    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('checkbox', { name: 'gpt-5' })
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('marks a selected row as aria-checked', async () => {
    render(
      <ModelPicker mode="filter-list" values={['gpt-5']} onChange={vi.fn()} groups={GROUPS} />
    );

    await openPicker();

    expect(
      within(screen.getByRole('dialog')).getByRole('checkbox', { name: 'gpt-5', checked: true })
    ).toBeInTheDocument();
  });

  it('removes a chip via its remove button without dropping the others', async () => {
    const onChange = vi.fn();
    render(
      <ModelPicker
        mode="filter-list"
        values={['gpt-5', 'gpt-5-mini']}
        onChange={onChange}
        groups={GROUPS}
      />
    );

    await userEvent.click(screen.getByLabelText('Remove gpt-5'));

    expect(onChange).toHaveBeenCalledWith(['gpt-5-mini']);
  });

  it('shows the selected count in the popover footer', async () => {
    render(
      <ModelPicker
        mode="filter-list"
        values={['gpt-5', 'gpt-5-mini']}
        onChange={vi.fn()}
        groups={GROUPS}
      />
    );

    await openPicker();

    expect(within(screen.getByRole('dialog')).getByText('2 selected')).toBeInTheDocument();
  });

  it('clears the entire selection when "Clear all" is clicked', async () => {
    const onChange = vi.fn();
    render(
      <ModelPicker
        mode="filter-list"
        values={['gpt-5', 'gpt-5-mini']}
        onChange={onChange}
        groups={GROUPS}
      />
    );
    await openPicker();

    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('does not render the footer when nothing is selected', async () => {
    render(<ModelPicker mode="filter-list" values={[]} onChange={vi.fn()} groups={GROUPS} />);

    await openPicker();

    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();
  });
});

describe('ModelPicker — popover interactions', () => {
  it('closes the popover when Escape is pressed in the search box', async () => {
    render(<ModelPicker mode="active" value="" onChange={vi.fn()} groups={GROUPS} />);
    await openPicker();

    await userEvent.type(screen.getByRole('searchbox'), '{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('toggles the popover closed when the trigger is clicked while open', async () => {
    render(
      <ModelPicker
        mode="active"
        value=""
        onChange={vi.fn()}
        groups={GROUPS}
        ariaLabel="Active model"
      />
    );
    await openPicker();

    await userEvent.click(screen.getByRole('button', { name: 'Active model' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes the popover when clicking outside it', async () => {
    render(
      <div>
        <span data-testid="outside">outside</span>
        <ModelPicker mode="active" value="" onChange={vi.fn()} groups={GROUPS} />
      </div>
    );
    await openPicker();

    await userEvent.click(screen.getByTestId('outside'));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
