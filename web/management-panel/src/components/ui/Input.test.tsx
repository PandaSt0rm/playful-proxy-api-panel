import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/test/utils';
import { Input } from './Input';

describe('Input', () => {
  it('renders a textbox', () => {
    render(<Input />);

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('applies the base input class', () => {
    render(<Input />);

    expect(screen.getByRole('textbox')).toHaveClass('input');
  });

  it('appends a custom className after the base input class', () => {
    render(<Input className="mono" />);

    expect(screen.getByRole('textbox')).toHaveClass('input', 'mono');
  });

  it('uses exactly the trimmed base class when no className is provided', () => {
    render(<Input />);

    expect(screen.getByRole('textbox').getAttribute('class')).toBe('input');
  });

  it('renders a label associated with the input via htmlFor', () => {
    render(<Input label="Username" />);

    const input = screen.getByLabelText('Username');

    expect(input).toBe(screen.getByRole('textbox'));
  });

  it('uses the provided id on the input', () => {
    render(<Input id="custom-id" label="Field" />);

    expect(screen.getByRole('textbox')).toHaveAttribute('id', 'custom-id');
  });

  it('does not render a label element when no label is provided', () => {
    const { container } = render(<Input />);

    expect(container.querySelector('label')).not.toBeInTheDocument();
  });

  it('renders hint text', () => {
    render(<Input hint="Helpful guidance" />);

    expect(screen.getByText('Helpful guidance')).toBeInTheDocument();
  });

  it('does not render a hint container when no hint is provided', () => {
    const { container } = render(<Input />);

    expect(container.querySelector('.hint')).not.toBeInTheDocument();
  });

  it('renders error text', () => {
    render(<Input error="Required field" />);

    expect(screen.getByText('Required field')).toBeInTheDocument();
  });

  it('does not render an error box when no error is provided', () => {
    const { container } = render(<Input />);

    expect(container.querySelector('.error-box')).not.toBeInTheDocument();
  });

  it('marks the input invalid when an error is present', () => {
    render(<Input error="Bad value" />);

    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('omits aria-invalid entirely when there is no error and no aria-invalid prop', () => {
    render(<Input />);

    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid');
  });

  it('respects an explicit aria-invalid prop when no error is present', () => {
    render(<Input aria-invalid />);

    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  // NOTE: {...rest} is spread after the computed aria-invalid, so a caller's
  // explicit aria-invalid={false} overrides the error-derived true. This
  // asserts the ACTUAL current behaviour; see bugsFound.
  it('lets a caller aria-invalid of false override the error-derived invalid state', () => {
    render(<Input error="Bad value" aria-invalid={false} />);

    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'false');
  });

  it('describes the input with the hint id when only a hint is present', () => {
    render(<Input id="field" hint="Some hint" />);

    expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', 'field-hint');
  });

  it('describes the input with the error id when only an error is present', () => {
    render(<Input id="field" error="Some error" />);

    expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', 'field-error');
  });

  it('lists the error id before the hint id in aria-describedby', () => {
    render(<Input id="field" hint="A hint" error="An error" />);

    expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', 'field-error field-hint');
  });

  // NOTE: The component computes a merged describedBy ("external field-error
  // field-hint") but then spreads {...rest} last, so the caller's own
  // aria-describedby clobbers the merged value. This asserts the ACTUAL current
  // behaviour; see bugsFound for the merge that is silently discarded.
  it('keeps only the caller-supplied aria-describedby, discarding the merged error and hint ids', () => {
    render(<Input id="field" aria-describedby="external" hint="A hint" error="An error" />);

    expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', 'external');
  });

  it('omits aria-describedby entirely when there is nothing to describe', () => {
    render(<Input id="field" />);

    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-describedby');
  });

  it('links the hint container id to the input describedby', () => {
    const { container } = render(<Input id="field" hint="Linked hint" />);

    expect(container.querySelector('.hint')).toHaveAttribute('id', 'field-hint');
  });

  it('links the error container id to the input describedby', () => {
    const { container } = render(<Input id="field" error="Linked error" />);

    expect(container.querySelector('.error-box')).toHaveAttribute('id', 'field-error');
  });

  it('reflects a controlled value', () => {
    render(<Input value="preset" onChange={() => {}} />);

    expect(screen.getByRole('textbox')).toHaveValue('preset');
  });

  it('forwards each typed character to onChange', async () => {
    const onChange = vi.fn();
    render(<Input onChange={onChange} />);

    await userEvent.type(screen.getByRole('textbox'), 'abc');

    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('reports the typed text via the change event target value', async () => {
    const onChange = vi.fn();
    render(<Input onChange={onChange} />);

    await userEvent.type(screen.getByRole('textbox'), 'x');

    expect(onChange.mock.calls[0][0].target.value).toBe('x');
  });

  it('does not fire onChange when the input is disabled', async () => {
    const onChange = vi.fn();
    render(<Input onChange={onChange} disabled />);

    await userEvent.type(screen.getByRole('textbox'), 'abc');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('disables the input when the disabled prop is set', () => {
    render(<Input disabled />);

    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('forwards arbitrary input attributes such as placeholder', () => {
    render(<Input placeholder="Type here" />);

    expect(screen.getByPlaceholderText('Type here')).toBeInTheDocument();
  });

  it('forwards the input type attribute', () => {
    render(<Input type="password" aria-label="secret" />);

    expect(screen.getByLabelText('secret')).toHaveAttribute('type', 'password');
  });

  it('renders the rightElement node', () => {
    render(<Input rightElement={<button type="button">Toggle</button>} />);

    expect(screen.getByRole('button', { name: 'Toggle' })).toBeInTheDocument();
  });
});
