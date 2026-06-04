import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '@/test/utils';
import { Select, type SelectOption } from './Select';

const OPTIONS: ReadonlyArray<SelectOption> = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry' },
];

describe('Select', () => {
  it('renders a trigger button with listbox popup semantics', () => {
    render(<Select value="a" options={OPTIONS} onChange={() => {}} ariaLabel="Fruit" />);

    expect(screen.getByRole('button', { name: 'Fruit' })).toHaveAttribute('aria-haspopup', 'listbox');
  });

  it('displays the label of the currently selected value', () => {
    render(<Select value="b" options={OPTIONS} onChange={() => {}} ariaLabel="Fruit" />);

    expect(screen.getByRole('button', { name: 'Fruit' })).toHaveTextContent('Banana');
  });

  it('displays the placeholder when the value matches no option', () => {
    render(
      <Select value="" options={OPTIONS} onChange={() => {}} placeholder="Choose one" ariaLabel="Fruit" />
    );

    expect(screen.getByRole('button', { name: 'Fruit' })).toHaveTextContent('Choose one');
  });

  it('reports collapsed state via aria-expanded before opening', () => {
    render(<Select value="a" options={OPTIONS} onChange={() => {}} ariaLabel="Fruit" />);

    expect(screen.getByRole('button', { name: 'Fruit' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not render a listbox before being opened', () => {
    render(<Select value="a" options={OPTIONS} onChange={() => {}} ariaLabel="Fruit" />);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens the listbox when the trigger is clicked', async () => {
    render(<Select value="a" options={OPTIONS} onChange={() => {}} ariaLabel="Fruit" />);

    await userEvent.click(screen.getByRole('button', { name: 'Fruit' }));

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
  });

  it('marks the trigger expanded once the listbox is open', async () => {
    render(<Select value="a" options={OPTIONS} onChange={() => {}} ariaLabel="Fruit" />);

    await userEvent.click(screen.getByRole('button', { name: 'Fruit' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Fruit' })).toHaveAttribute('aria-expanded', 'true')
    );
  });

  it('renders one option per provided choice', async () => {
    render(<Select value="a" options={OPTIONS} onChange={() => {}} ariaLabel="Fruit" />);

    await userEvent.click(screen.getByRole('button', { name: 'Fruit' }));

    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(3);
  });

  it('marks the selected option as aria-selected', async () => {
    render(<Select value="c" options={OPTIONS} onChange={() => {}} ariaLabel="Fruit" />);

    await userEvent.click(screen.getByRole('button', { name: 'Fruit' }));

    expect(await screen.findByRole('option', { name: 'Cherry' })).toHaveAttribute('aria-selected', 'true');
  });

  it('marks non-selected options as not aria-selected', async () => {
    render(<Select value="c" options={OPTIONS} onChange={() => {}} ariaLabel="Fruit" />);

    await userEvent.click(screen.getByRole('button', { name: 'Fruit' }));

    expect(await screen.findByRole('option', { name: 'Apple' })).toHaveAttribute('aria-selected', 'false');
  });

  it('commits the chosen value to onChange when an option is clicked', async () => {
    const onChange = vi.fn();
    render(<Select value="a" options={OPTIONS} onChange={onChange} ariaLabel="Fruit" />);

    await userEvent.click(screen.getByRole('button', { name: 'Fruit' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Banana' }));

    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('closes the listbox after an option is selected', async () => {
    render(<Select value="a" options={OPTIONS} onChange={() => {}} ariaLabel="Fruit" />);

    await userEvent.click(screen.getByRole('button', { name: 'Fruit' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Banana' }));

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('toggles the listbox closed on a second trigger click', async () => {
    render(<Select value="a" options={OPTIONS} onChange={() => {}} ariaLabel="Fruit" />);

    await userEvent.click(screen.getByRole('button', { name: 'Fruit' }));
    await screen.findByRole('listbox');
    await userEvent.click(screen.getByRole('button', { name: 'Fruit' }));

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('opens the listbox with the ArrowDown key', async () => {
    render(<Select value="a" options={OPTIONS} onChange={() => {}} ariaLabel="Fruit" />);

    screen.getByRole('button', { name: 'Fruit' }).focus();
    await userEvent.keyboard('{ArrowDown}');

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
  });

  it('commits the highlighted option with the Enter key', async () => {
    const onChange = vi.fn();
    render(<Select value="a" options={OPTIONS} onChange={onChange} ariaLabel="Fruit" />);

    screen.getByRole('button', { name: 'Fruit' }).focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('wraps the highlight from the last option back to the first with ArrowDown', async () => {
    const onChange = vi.fn();
    render(<Select value="c" options={OPTIONS} onChange={onChange} ariaLabel="Fruit" />);

    screen.getByRole('button', { name: 'Fruit' }).focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('closes the listbox with the Escape key without committing a value', async () => {
    const onChange = vi.fn();
    render(<Select value="a" options={OPTIONS} onChange={onChange} ariaLabel="Fruit" />);

    screen.getByRole('button', { name: 'Fruit' }).focus();
    await userEvent.keyboard('{ArrowDown}');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disables the trigger when disabled', () => {
    render(<Select value="a" options={OPTIONS} onChange={() => {}} disabled ariaLabel="Fruit" />);

    expect(screen.getByRole('button', { name: 'Fruit' })).toBeDisabled();
  });

  it('does not open the listbox when disabled and clicked', async () => {
    render(<Select value="a" options={OPTIONS} onChange={() => {}} disabled ariaLabel="Fruit" />);

    await userEvent.click(screen.getByRole('button', { name: 'Fruit' }));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('renders an empty trigger label when there is neither a match nor a placeholder', () => {
    render(<Select value="" options={OPTIONS} onChange={() => {}} ariaLabel="Fruit" />);

    expect(screen.getByRole('button', { name: 'Fruit' })).toHaveTextContent('');
  });

  it('renders no options when the option list is empty', async () => {
    render(<Select value="" options={[]} onChange={() => {}} placeholder="None" ariaLabel="Fruit" />);

    await userEvent.click(screen.getByRole('button', { name: 'Fruit' }));

    await screen.findByRole('listbox');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('exposes the ariaLabel on the listbox', async () => {
    render(<Select value="a" options={OPTIONS} onChange={() => {}} ariaLabel="Fruit" />);

    await userEvent.click(screen.getByRole('button', { name: 'Fruit' }));

    expect(await screen.findByRole('listbox', { name: 'Fruit' })).toBeInTheDocument();
  });

  it('applies a caller-provided id to the trigger button', () => {
    render(<Select value="a" options={OPTIONS} onChange={() => {}} id="fruit-select" ariaLabel="Fruit" />);

    expect(screen.getByRole('button', { name: 'Fruit' })).toHaveAttribute('id', 'fruit-select');
  });
});
