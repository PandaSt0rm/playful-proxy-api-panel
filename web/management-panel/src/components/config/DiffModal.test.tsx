import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent, within } from '@/test/utils';
import { DiffModal } from './DiffModal';

const baseProps = {
  open: true,
  original: 'port: 8317',
  modified: 'port: 9000',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe('DiffModal', () => {
  it('renders nothing when closed', () => {
    render(<DiffModal {...baseProps} open={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the review-changes title when open', () => {
    render(<DiffModal {...baseProps} />);

    expect(screen.getByText('Review Changes')).toBeInTheDocument();
  });

  it('shows the no-changes message when original equals modified', () => {
    render(<DiffModal {...baseProps} original="port: 8317" modified="port: 8317" />);

    expect(screen.getByText('No changes detected')).toBeInTheDocument();
  });

  it('does not render the file header when there are no changes', () => {
    render(<DiffModal {...baseProps} original="same" modified="same" />);

    expect(screen.queryByText('config.yaml')).not.toBeInTheDocument();
  });

  it('renders the config.yaml file name in the diff header', () => {
    render(<DiffModal {...baseProps} />);

    expect(screen.getByText('config.yaml')).toBeInTheDocument();
  });

  it('shows one addition and one deletion stat for a single-line replacement', () => {
    render(<DiffModal {...baseProps} original="port: 8317" modified="port: 9000" />);

    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('-1')).toBeInTheDocument();
  });

  it('renders the unified hunk header for a single-line replacement', () => {
    render(<DiffModal {...baseProps} original="port: 8317" modified="port: 9000" />);

    expect(screen.getByText('@@ -1,1 +1,1 @@')).toBeInTheDocument();
  });

  it('renders the deleted line text for a single-line replacement', () => {
    render(<DiffModal {...baseProps} original="port: 8317" modified="port: 9000" />);

    expect(screen.getByText('port: 8317')).toBeInTheDocument();
  });

  it('renders the added line text for a single-line replacement', () => {
    render(<DiffModal {...baseProps} original="port: 8317" modified="port: 9000" />);

    expect(screen.getByText('port: 9000')).toBeInTheDocument();
  });

  it('renders three context lines before and after a mid-document change', () => {
    const original = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7'].join('\n');
    const modified = ['l1', 'l2', 'l3', 'CHANGED', 'l5', 'l6', 'l7'].join('\n');

    render(<DiffModal {...baseProps} original={original} modified={modified} />);

    expect(screen.getByText('@@ -1,7 +1,7 @@')).toBeInTheDocument();
  });

  it('renders the changed line as an addition for a mid-document change', () => {
    const original = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7'].join('\n');
    const modified = ['l1', 'l2', 'l3', 'CHANGED', 'l5', 'l6', 'l7'].join('\n');

    render(<DiffModal {...baseProps} original={original} modified={modified} />);

    expect(screen.getByText('CHANGED')).toBeInTheDocument();
  });

  it('invokes onConfirm exactly once when the confirm button is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(<DiffModal {...baseProps} onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Confirm Save' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('invokes onCancel exactly once when the cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(<DiffModal {...baseProps} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables the confirm button while loading', () => {
    render(<DiffModal {...baseProps} loading />);

    expect(screen.getByRole('button', { name: 'Confirm Save' })).toBeDisabled();
  });

  it('disables the cancel button while loading', () => {
    render(<DiffModal {...baseProps} loading />);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('does not invoke onCancel when the disabled cancel button is clicked while loading', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(<DiffModal {...baseProps} loading onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).not.toHaveBeenCalled();
  });

  it('renders an addition stat reflecting a pure two-line append into one line', () => {
    render(<DiffModal {...baseProps} original="a" modified={'a\nb'} />);

    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('renders deletion and addition counts for adding a line', () => {
    render(<DiffModal {...baseProps} original={'a\nb'} modified="a" />);

    const stats = within(screen.getByRole('dialog'));

    expect(stats.getByText('-2')).toBeInTheDocument();
  });
});
