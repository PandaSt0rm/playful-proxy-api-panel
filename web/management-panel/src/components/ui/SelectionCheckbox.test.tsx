import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/test/utils';
import { SelectionCheckbox } from './SelectionCheckbox';

describe('SelectionCheckbox', () => {
  it('renders a checkbox input', () => {
    render(<SelectionCheckbox checked={false} onChange={() => {}} />);

    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('reflects the checked state when selected', () => {
    render(<SelectionCheckbox checked onChange={() => {}} />);

    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('reflects the unchecked state when not selected', () => {
    render(<SelectionCheckbox checked={false} onChange={() => {}} />);

    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('reports true to onChange when selecting from unchecked', async () => {
    const onChange = vi.fn();
    render(<SelectionCheckbox checked={false} onChange={onChange} ariaLabel="row" />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'row' }));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reports false to onChange when deselecting from checked', async () => {
    const onChange = vi.fn();
    render(<SelectionCheckbox checked onChange={onChange} ariaLabel="row" />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'row' }));

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('invokes onChange exactly once per click', async () => {
    const onChange = vi.fn();
    render(<SelectionCheckbox checked={false} onChange={onChange} ariaLabel="row" />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'row' }));

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('toggles via keyboard space activation', async () => {
    const onChange = vi.fn();
    render(<SelectionCheckbox checked={false} onChange={onChange} ariaLabel="row" />);

    screen.getByRole('checkbox').focus();
    await userEvent.keyboard(' ');

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('exposes the ariaLabel as the accessible name', () => {
    render(<SelectionCheckbox checked={false} onChange={() => {}} ariaLabel="Select all" />);

    expect(screen.getByRole('checkbox', { name: 'Select all' })).toBeInTheDocument();
  });

  it('uses visible label text as the accessible name when no ariaLabel is given', () => {
    render(<SelectionCheckbox checked={false} onChange={() => {}} label="Pick me" />);

    expect(screen.getByRole('checkbox', { name: 'Pick me' })).toBeInTheDocument();
  });

  it('renders the visible label text', () => {
    render(<SelectionCheckbox checked={false} onChange={() => {}} label="Enable item" />);

    expect(screen.getByText('Enable item')).toBeInTheDocument();
  });

  it('does not render a label container when no label is provided', () => {
    const { container } = render(<SelectionCheckbox checked={false} onChange={() => {}} ariaLabel="row" />);

    expect(container.querySelector('div')).not.toBeInTheDocument();
  });

  it('applies the title attribute to the wrapping label', () => {
    const { container } = render(
      <SelectionCheckbox checked={false} onChange={() => {}} title="Tooltip text" />
    );

    expect(container.querySelector('label')).toHaveAttribute('title', 'Tooltip text');
  });

  it('disables the checkbox when disabled', () => {
    render(<SelectionCheckbox checked={false} onChange={() => {}} disabled ariaLabel="row" />);

    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('does not invoke onChange when disabled and clicked', async () => {
    const onChange = vi.fn();
    render(<SelectionCheckbox checked={false} onChange={onChange} disabled ariaLabel="row" />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'row' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders a check icon when checked', () => {
    const { container } = render(<SelectionCheckbox checked onChange={() => {}} ariaLabel="row" />);

    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders no check icon when unchecked', () => {
    const { container } = render(<SelectionCheckbox checked={false} onChange={() => {}} ariaLabel="row" />);

    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });
});
