import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/test/utils';
import { AutocompleteInput } from './AutocompleteInput';

const STRING_OPTIONS = ['alpha', 'beta', 'gamma'];

describe('AutocompleteInput', () => {
  it('renders the current value in the input', () => {
    render(<AutocompleteInput value="hello" onChange={() => {}} options={STRING_OPTIONS} />);

    expect(screen.getByRole('textbox')).toHaveValue('hello');
  });

  it('renders a label associated with the input via id', () => {
    render(
      <AutocompleteInput
        label="Model"
        id="model-field"
        value=""
        onChange={() => {}}
        options={STRING_OPTIONS}
      />
    );

    expect(screen.getByLabelText('Model')).toBe(screen.getByRole('textbox'));
  });

  it('renders the placeholder when provided', () => {
    render(
      <AutocompleteInput
        value=""
        onChange={() => {}}
        options={STRING_OPTIONS}
        placeholder="Pick one"
      />
    );

    expect(screen.getByPlaceholderText('Pick one')).toBeInTheDocument();
  });

  it('renders the hint text when provided', () => {
    const { container } = render(
      <AutocompleteInput
        value=""
        onChange={() => {}}
        options={STRING_OPTIONS}
        hint="A helpful hint"
      />
    );

    expect(container.querySelector('.hint')).toHaveTextContent('A helpful hint');
  });

  it('renders the error text when provided', () => {
    const { container } = render(
      <AutocompleteInput
        value=""
        onChange={() => {}}
        options={STRING_OPTIONS}
        error="Something broke"
      />
    );

    expect(container.querySelector('.error-box')).toHaveTextContent('Something broke');
  });

  it('keeps the dropdown closed before any interaction', () => {
    const { container } = render(
      <AutocompleteInput value="" onChange={() => {}} options={STRING_OPTIONS} />
    );

    expect(container.querySelector('.autocomplete-dropdown')).toBeNull();
  });

  it('opens the dropdown showing all options on focus', async () => {
    const user = userEvent.setup();
    render(<AutocompleteInput value="" onChange={() => {}} options={STRING_OPTIONS} />);

    await user.click(screen.getByRole('textbox'));

    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
    expect(screen.getByText('gamma')).toBeInTheDocument();
  });

  it('filters options case-insensitively by the current value', async () => {
    const user = userEvent.setup();
    render(<AutocompleteInput value="BET" onChange={() => {}} options={STRING_OPTIONS} />);

    await user.click(screen.getByRole('textbox'));

    expect(screen.getByText('beta')).toBeInTheDocument();
    expect(screen.queryByText('alpha')).toBeNull();
    expect(screen.queryByText('gamma')).toBeNull();
  });

  it('hides the dropdown entirely when the value matches no option', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AutocompleteInput value="zzz" onChange={() => {}} options={STRING_OPTIONS} />
    );

    await user.click(screen.getByRole('textbox'));

    expect(container.querySelector('.autocomplete-dropdown')).toBeNull();
  });

  it('emits each typed character through onChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<AutocompleteInput value="" onChange={onChange} options={STRING_OPTIONS} />);

    await user.type(screen.getByRole('textbox'), 'ab');

    expect(onChange).toHaveBeenNthCalledWith(1, 'a');
    expect(onChange).toHaveBeenNthCalledWith(2, 'b');
  });

  it('emits the option value when an option is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<AutocompleteInput value="" onChange={onChange} options={STRING_OPTIONS} />);

    await user.click(screen.getByRole('textbox'));
    await user.click(screen.getByText('gamma'));

    expect(onChange).toHaveBeenCalledExactlyOnceWith('gamma');
  });

  it('closes the dropdown after selecting an option', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AutocompleteInput value="" onChange={() => {}} options={STRING_OPTIONS} />
    );

    await user.click(screen.getByRole('textbox'));
    await user.click(screen.getByText('alpha'));

    expect(container.querySelector('.autocomplete-dropdown')).toBeNull();
  });

  it('toggles the dropdown open when the chevron area is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AutocompleteInput value="" onChange={() => {}} options={STRING_OPTIONS} />
    );

    await user.click(container.querySelector('.input')!.nextElementSibling as Element);

    expect(container.querySelector('.autocomplete-dropdown')).not.toBeNull();
  });

  it('closes the dropdown when clicking outside the container', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div>
        <AutocompleteInput value="" onChange={() => {}} options={STRING_OPTIONS} />
        <button type="button">outside</button>
      </div>
    );

    await user.click(screen.getByRole('textbox'));
    await user.click(screen.getByRole('button', { name: 'outside' }));

    expect(container.querySelector('.autocomplete-dropdown')).toBeNull();
  });

  it('re-opens the dropdown on ArrowDown after it was closed with Escape', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AutocompleteInput value="" onChange={() => {}} options={STRING_OPTIONS} />
    );

    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{Escape}{ArrowDown}');

    const rows = container.querySelectorAll('.autocomplete-dropdown > div');
    expect(rows).toHaveLength(STRING_OPTIONS.length);
  });

  it('re-opens the dropdown on ArrowUp after it was closed with Escape', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AutocompleteInput value="" onChange={() => {}} options={STRING_OPTIONS} />
    );

    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{Escape}{ArrowUp}');

    expect(container.querySelector('.autocomplete-dropdown')).not.toBeNull();
  });

  it('selects the highlighted option with Enter after ArrowDown navigation', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<AutocompleteInput value="" onChange={onChange} options={STRING_OPTIONS} />);

    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledExactlyOnceWith('alpha');
  });

  it('selects the second option with Enter after two ArrowDown presses', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<AutocompleteInput value="" onChange={onChange} options={STRING_OPTIONS} />);

    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledExactlyOnceWith('beta');
  });

  it('stops highlighting at the last option when pressing ArrowDown past the end', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<AutocompleteInput value="" onChange={onChange} options={STRING_OPTIONS} />);

    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledExactlyOnceWith('gamma');
  });

  it('moves the highlight up to the first option with ArrowUp', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<AutocompleteInput value="" onChange={onChange} options={STRING_OPTIONS} />);

    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{Enter}');

    expect(onChange).toHaveBeenCalledExactlyOnceWith('alpha');
  });

  it('clamps the highlight to the first option when pressing ArrowUp past the start', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<AutocompleteInput value="" onChange={onChange} options={STRING_OPTIONS} />);

    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{ArrowDown}{ArrowUp}{ArrowUp}{ArrowUp}{Enter}');

    expect(onChange).toHaveBeenCalledExactlyOnceWith('alpha');
  });

  it('does not select any option when Enter is pressed with no highlight', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<AutocompleteInput value="" onChange={onChange} options={STRING_OPTIONS} />);

    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{Enter}');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes the dropdown when Enter is pressed with no highlight', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AutocompleteInput value="" onChange={() => {}} options={STRING_OPTIONS} />
    );

    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{Enter}');

    expect(container.querySelector('.autocomplete-dropdown')).toBeNull();
  });

  it('closes the dropdown when Escape is pressed', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AutocompleteInput value="" onChange={() => {}} options={STRING_OPTIONS} />
    );

    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{Escape}');

    expect(container.querySelector('.autocomplete-dropdown')).toBeNull();
  });

  it('closes the dropdown when Tab is pressed', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AutocompleteInput value="" onChange={() => {}} options={STRING_OPTIONS} />
    );

    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{Tab}');

    expect(container.querySelector('.autocomplete-dropdown')).toBeNull();
  });

  it('updates the highlight to the option hovered by the mouse', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<AutocompleteInput value="" onChange={onChange} options={STRING_OPTIONS} />);

    await user.click(screen.getByRole('textbox'));
    await user.hover(screen.getByText('gamma'));
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledExactlyOnceWith('gamma');
  });

  it('ignores key handling entirely when disabled', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <AutocompleteInput value="" onChange={onChange} options={STRING_OPTIONS} disabled />
    );

    screen.getByRole('textbox').focus();
    await user.keyboard('{ArrowDown}{Enter}');

    expect(container.querySelector('.autocomplete-dropdown')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not render the dropdown when disabled even with matching options', () => {
    const { container } = render(
      <AutocompleteInput value="alpha" onChange={() => {}} options={STRING_OPTIONS} disabled />
    );

    expect(container.querySelector('.autocomplete-dropdown')).toBeNull();
  });

  it('renders the disabled input as disabled', () => {
    render(<AutocompleteInput value="" onChange={() => {}} options={STRING_OPTIONS} disabled />);

    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('renders object options using their value as primary text', async () => {
    const user = userEvent.setup();
    render(
      <AutocompleteInput
        value=""
        onChange={() => {}}
        options={[{ value: 'gpt-4', label: 'GPT 4 Turbo' }]}
      />
    );

    await user.click(screen.getByRole('textbox'));

    expect(screen.getByText('gpt-4')).toBeInTheDocument();
    expect(screen.getByText('GPT 4 Turbo')).toBeInTheDocument();
  });

  it('filters object options by their label as well as value', async () => {
    const user = userEvent.setup();
    render(
      <AutocompleteInput
        value="turbo"
        onChange={() => {}}
        options={[
          { value: 'gpt-4', label: 'GPT 4 Turbo' },
          { value: 'gpt-3', label: 'GPT 3 Standard' },
        ]}
      />
    );

    await user.click(screen.getByRole('textbox'));

    expect(screen.getByText('gpt-4')).toBeInTheDocument();
    expect(screen.queryByText('gpt-3')).toBeNull();
  });

  it('does not render a secondary label line when value and label are identical', async () => {
    const user = userEvent.setup();
    render(
      <AutocompleteInput
        value=""
        onChange={() => {}}
        options={[{ value: 'same', label: 'same' }]}
      />
    );

    await user.click(screen.getByRole('textbox'));

    expect(screen.getAllByText('same')).toHaveLength(1);
  });

  it('handles an empty options list by rendering no dropdown', async () => {
    const user = userEvent.setup();
    const { container } = render(<AutocompleteInput value="" onChange={() => {}} options={[]} />);

    await user.click(screen.getByRole('textbox'));

    expect(container.querySelector('.autocomplete-dropdown')).toBeNull();
  });

  it('renders a provided right element next to the chevron', async () => {
    const user = userEvent.setup();
    render(
      <AutocompleteInput
        value=""
        onChange={() => {}}
        options={STRING_OPTIONS}
        rightElement={<span data-testid="right-slot">extra</span>}
      />
    );

    await user.click(screen.getByRole('textbox'));

    expect(screen.getByTestId('right-slot')).toBeInTheDocument();
  });
});
