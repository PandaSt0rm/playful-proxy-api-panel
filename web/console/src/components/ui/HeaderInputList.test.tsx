import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/test/utils';
import { HeaderInputList } from './HeaderInputList';
import type { HeaderEntry } from '@/utils/headers';

const ENTRIES: HeaderEntry[] = [
  { key: 'X-Api-Key', value: 'secret' },
  { key: 'X-Trace', value: 'on' },
];

describe('HeaderInputList', () => {
  it('renders one key/value input pair per entry', () => {
    render(<HeaderInputList entries={ENTRIES} onChange={() => {}} addLabel="Add header" />);

    expect(screen.getByDisplayValue('X-Api-Key')).toBeInTheDocument();
    expect(screen.getByDisplayValue('secret')).toBeInTheDocument();
    expect(screen.getByDisplayValue('X-Trace')).toBeInTheDocument();
    expect(screen.getByDisplayValue('on')).toBeInTheDocument();
  });

  it('renders a single empty row when entries is empty', () => {
    render(<HeaderInputList entries={[]} onChange={() => {}} addLabel="Add header" />);

    expect(screen.getAllByRole('textbox')).toHaveLength(2);
  });

  it('renders the add button with the provided label', () => {
    render(<HeaderInputList entries={ENTRIES} onChange={() => {}} addLabel="Add header" />);

    expect(screen.getByRole('button', { name: 'Add header' })).toBeInTheDocument();
  });

  it('uses the default placeholders when none are supplied', () => {
    render(<HeaderInputList entries={[]} onChange={() => {}} addLabel="Add" />);

    expect(screen.getByPlaceholderText('X-Custom-Header')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('value')).toBeInTheDocument();
  });

  it('uses custom placeholders when supplied', () => {
    render(
      <HeaderInputList
        entries={[]}
        onChange={() => {}}
        addLabel="Add"
        keyPlaceholder="Header name"
        valuePlaceholder="Header value"
      />
    );

    expect(screen.getByPlaceholderText('Header name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Header value')).toBeInTheDocument();
  });

  it('emits the updated key for the edited row, leaving other rows intact', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<HeaderInputList entries={ENTRIES} onChange={onChange} addLabel="Add" />);

    await user.type(screen.getByDisplayValue('X-Api-Key'), 'Z');

    expect(onChange).toHaveBeenCalledExactlyOnceWith([
      { key: 'X-Api-KeyZ', value: 'secret' },
      { key: 'X-Trace', value: 'on' },
    ]);
  });

  it('emits the updated value for the edited row, preserving its key', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <HeaderInputList
        entries={[{ key: 'X-Api-Key', value: 'old' }]}
        onChange={onChange}
        addLabel="Add"
      />
    );

    await user.type(screen.getByDisplayValue('old'), '!');

    expect(onChange).toHaveBeenCalledExactlyOnceWith([{ key: 'X-Api-Key', value: 'old!' }]);
  });

  it('appends a new empty entry when the add button is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<HeaderInputList entries={ENTRIES} onChange={onChange} addLabel="Add" />);

    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith([
      { key: 'X-Api-Key', value: 'secret' },
      { key: 'X-Trace', value: 'on' },
      { key: '', value: '' },
    ]);
  });

  it('removes the targeted row and emits the remaining entries', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<HeaderInputList entries={ENTRIES} onChange={onChange} addLabel="Add" />);

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]);

    expect(onChange).toHaveBeenCalledExactlyOnceWith([{ key: 'X-Trace', value: 'on' }]);
  });

  it('does not emit when clicking the disabled single-row remove button', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <HeaderInputList
        entries={[{ key: 'X-Solo', value: 'v' }]}
        onChange={onChange}
        addLabel="Add"
      />
    );

    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('disables the remove button when only a single row remains', () => {
    render(
      <HeaderInputList
        entries={[{ key: 'X-Solo', value: 'v' }]}
        onChange={() => {}}
        addLabel="Add"
      />
    );

    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
  });

  it('enables the remove buttons when more than one row remains', () => {
    render(<HeaderInputList entries={ENTRIES} onChange={() => {}} addLabel="Add" />);

    screen.getAllByRole('button', { name: 'Remove' }).forEach((button) => {
      expect(button).toBeEnabled();
    });
  });

  it('disables every input and button when disabled is true', () => {
    render(<HeaderInputList entries={ENTRIES} onChange={() => {}} addLabel="Add" disabled />);

    screen.getAllByRole('textbox').forEach((input) => expect(input).toBeDisabled());
    screen.getAllByRole('button').forEach((button) => expect(button).toBeDisabled());
  });

  it('does not emit when clicking a disabled remove button', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<HeaderInputList entries={ENTRIES} onChange={onChange} addLabel="Add" disabled />);

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies the custom remove button accessible label', () => {
    render(
      <HeaderInputList
        entries={ENTRIES}
        onChange={() => {}}
        addLabel="Add"
        removeButtonAriaLabel="Delete header"
      />
    );

    expect(screen.getAllByRole('button', { name: 'Delete header' })).toHaveLength(2);
  });

  it('applies the custom remove button title attribute', () => {
    render(
      <HeaderInputList
        entries={[{ key: 'X-Solo', value: 'v' }]}
        onChange={() => {}}
        addLabel="Add"
        removeButtonTitle="Drop it"
      />
    );

    expect(screen.getByRole('button', { name: 'Remove' })).toHaveAttribute('title', 'Drop it');
  });
});
