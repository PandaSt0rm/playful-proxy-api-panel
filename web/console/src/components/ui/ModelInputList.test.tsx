import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/test/utils';
import { ModelInputList } from './ModelInputList';
import type { ModelEntry } from './modelInputListUtils';

const ENTRIES: ModelEntry[] = [
  { name: 'gpt-4', alias: 'big' },
  { name: 'gpt-3', alias: 'small' },
];

describe('ModelInputList', () => {
  it('renders one name/alias input pair per entry', () => {
    render(<ModelInputList entries={ENTRIES} onChange={() => {}} addLabel="Add model" />);

    expect(screen.getByDisplayValue('gpt-4')).toBeInTheDocument();
    expect(screen.getByDisplayValue('big')).toBeInTheDocument();
    expect(screen.getByDisplayValue('gpt-3')).toBeInTheDocument();
    expect(screen.getByDisplayValue('small')).toBeInTheDocument();
  });

  it('renders a single empty row when entries is empty', () => {
    render(<ModelInputList entries={[]} onChange={() => {}} addLabel="Add model" />);

    expect(screen.getAllByRole('textbox')).toHaveLength(2);
  });

  it('uses the default name and alias placeholders when none are supplied', () => {
    render(<ModelInputList entries={[]} onChange={() => {}} addLabel="Add" />);

    expect(screen.getByPlaceholderText('model-name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('alias (optional)')).toBeInTheDocument();
  });

  it('uses custom placeholders when supplied', () => {
    render(
      <ModelInputList
        entries={[]}
        onChange={() => {}}
        addLabel="Add"
        namePlaceholder="Model id"
        aliasPlaceholder="Friendly name"
      />
    );

    expect(screen.getByPlaceholderText('Model id')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Friendly name')).toBeInTheDocument();
  });

  it('emits the updated name for the edited row, leaving other rows intact', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ModelInputList entries={ENTRIES} onChange={onChange} addLabel="Add" />);

    await user.type(screen.getByDisplayValue('gpt-4'), 'o');

    expect(onChange).toHaveBeenCalledExactlyOnceWith([
      { name: 'gpt-4o', alias: 'big' },
      { name: 'gpt-3', alias: 'small' },
    ]);
  });

  it('emits the updated alias for the edited row, preserving its name', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ModelInputList
        entries={[{ name: 'gpt-4', alias: 'big' }]}
        onChange={onChange}
        addLabel="Add"
      />
    );

    await user.type(screen.getByDisplayValue('big'), '!');

    expect(onChange).toHaveBeenCalledExactlyOnceWith([{ name: 'gpt-4', alias: 'big!' }]);
  });

  it('appends a new empty entry when the add button is clicked without onAdd', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ModelInputList entries={ENTRIES} onChange={onChange} addLabel="Add" />);

    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith([
      { name: 'gpt-4', alias: 'big' },
      { name: 'gpt-3', alias: 'small' },
      { name: '', alias: '' },
    ]);
  });

  it('delegates to onAdd instead of onChange when onAdd is provided', async () => {
    const onChange = vi.fn();
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<ModelInputList entries={ENTRIES} onChange={onChange} onAdd={onAdd} addLabel="Add" />);

    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onAdd).toHaveBeenCalledExactlyOnceWith();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes the targeted row and emits the remaining entries', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ModelInputList entries={ENTRIES} onChange={onChange} addLabel="Add" />);

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[1]);

    expect(onChange).toHaveBeenCalledExactlyOnceWith([{ name: 'gpt-4', alias: 'big' }]);
  });

  it('does not emit when clicking the disabled single-row remove button', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ModelInputList entries={[{ name: 'solo', alias: 'a' }]} onChange={onChange} addLabel="Add" />
    );

    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('disables the remove button when only a single row remains', () => {
    render(
      <ModelInputList entries={[{ name: 'solo', alias: 'a' }]} onChange={() => {}} addLabel="Add" />
    );

    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
  });

  it('enables the remove buttons when more than one row remains', () => {
    render(<ModelInputList entries={ENTRIES} onChange={() => {}} addLabel="Add" />);

    screen.getAllByRole('button', { name: 'Remove' }).forEach((button) => {
      expect(button).toBeEnabled();
    });
  });

  it('hides the add button when addLabel is omitted', () => {
    render(<ModelInputList entries={ENTRIES} onChange={() => {}} />);

    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /add/i })).toBeNull();
  });

  it('hides the add button when hideAddButton is true even with an addLabel', () => {
    render(<ModelInputList entries={ENTRIES} onChange={() => {}} addLabel="Add" hideAddButton />);

    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
  });

  it('disables every input and button when disabled is true', () => {
    render(<ModelInputList entries={ENTRIES} onChange={() => {}} addLabel="Add" disabled />);

    screen.getAllByRole('textbox').forEach((input) => expect(input).toBeDisabled());
    screen.getAllByRole('button').forEach((button) => expect(button).toBeDisabled());
  });

  it('renders custom row extras and threads the entry through to them', () => {
    render(
      <ModelInputList
        entries={[{ name: 'gpt-4', alias: 'big' }]}
        onChange={() => {}}
        addLabel="Add"
        renderRowExtras={({ entry, index }) => (
          <span data-testid="extra">{`${index}:${entry.name}`}</span>
        )}
      />
    );

    expect(screen.getByTestId('extra')).toHaveTextContent('0:gpt-4');
  });

  it('lets row extras patch the entry via updateEntry, emitting the merged result', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ModelInputList
        entries={[{ name: 'gpt-4', alias: 'big' }]}
        onChange={onChange}
        addLabel="Add"
        renderRowExtras={({ updateEntry }) => (
          <button type="button" onClick={() => updateEntry({ regex: true })}>
            toggle-regex
          </button>
        )}
      />
    );

    await user.click(screen.getByRole('button', { name: 'toggle-regex' }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith([
      { name: 'gpt-4', alias: 'big', regex: true },
    ]);
  });

  it('applies the custom remove button accessible label', () => {
    render(
      <ModelInputList
        entries={ENTRIES}
        onChange={() => {}}
        addLabel="Add"
        removeButtonAriaLabel="Delete model"
      />
    );

    expect(screen.getAllByRole('button', { name: 'Delete model' })).toHaveLength(2);
  });

  it('applies the container, row and input class names alongside the defaults', () => {
    const { container } = render(
      <ModelInputList
        entries={[{ name: 'gpt-4', alias: 'big' }]}
        onChange={() => {}}
        addLabel="Add"
        className="my-container"
        rowClassName="my-row"
        inputClassName="my-input"
      />
    );

    expect(container.querySelector('.header-input-list')).toHaveClass('my-container');
    expect(container.querySelector('.header-input-row')).toHaveClass('my-row');
    expect(screen.getByDisplayValue('gpt-4')).toHaveClass('input', 'my-input');
  });
});
