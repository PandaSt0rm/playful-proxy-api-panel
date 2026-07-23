import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/test/utils';
import { ToggleSwitch } from './ToggleSwitch';

describe('ToggleSwitch', () => {
  it('renders a checkbox input', () => {
    render(<ToggleSwitch checked={false} onChange={() => {}} />);

    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('reflects the checked state when on', () => {
    render(<ToggleSwitch checked onChange={() => {}} />);

    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('reflects the unchecked state when off', () => {
    render(<ToggleSwitch checked={false} onChange={() => {}} />);

    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('reports true to onChange when toggled on from off', async () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} ariaLabel="feature" />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'feature' }));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reports false to onChange when toggled off from on', async () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked onChange={onChange} ariaLabel="feature" />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'feature' }));

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('invokes onChange exactly once per click', async () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} ariaLabel="feature" />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'feature' }));

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('toggles via keyboard space activation', async () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} ariaLabel="feature" />);

    screen.getByRole('checkbox').focus();
    await userEvent.keyboard(' ');

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('exposes the ariaLabel as the accessible name', () => {
    render(<ToggleSwitch checked={false} onChange={() => {}} ariaLabel="Enable dark mode" />);

    expect(screen.getByRole('checkbox', { name: 'Enable dark mode' })).toBeInTheDocument();
  });

  it('uses visible label text as the accessible name when no ariaLabel is given', () => {
    render(<ToggleSwitch checked={false} onChange={() => {}} label="Visible label" />);

    expect(screen.getByRole('checkbox', { name: 'Visible label' })).toBeInTheDocument();
  });

  it('renders the visible label text', () => {
    render(<ToggleSwitch checked={false} onChange={() => {}} label="Notifications" />);

    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('disables the checkbox when disabled', () => {
    render(<ToggleSwitch checked={false} onChange={() => {}} disabled ariaLabel="feature" />);

    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('does not invoke onChange when disabled and clicked', async () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} disabled ariaLabel="feature" />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'feature' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not render a label span when no label is provided', () => {
    const { container } = render(
      <ToggleSwitch checked={false} onChange={() => {}} ariaLabel="feature" />
    );

    expect(container.querySelectorAll('span').length).toBe(2);
  });
});
