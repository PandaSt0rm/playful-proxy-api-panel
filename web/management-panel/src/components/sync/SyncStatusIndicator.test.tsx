import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils';
import { SyncStatusIndicator, type SyncStatus } from './SyncStatusIndicator';

describe('SyncStatusIndicator', () => {
  it.each([
    ['synced', 'Synced'],
    ['outdated', 'Outdated'],
    ['never-synced', 'Never Synced'],
    ['error', 'Error'],
    ['conflict', 'Conflict'],
  ] as [SyncStatus, string][])(
    'renders the %s status with the "%s" label',
    (status, expectedLabel) => {
      render(<SyncStatusIndicator status={status} />);

      expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    }
  );

  it('renders the lastSync timestamp text when provided', () => {
    render(<SyncStatusIndicator status="synced" lastSync="2026-06-01 12:00" />);

    expect(screen.getByText('2026-06-01 12:00')).toBeInTheDocument();
  });

  it('labels the timestamp element with the "Last synced" aria-label', () => {
    render(<SyncStatusIndicator status="synced" lastSync="yesterday" />);

    expect(screen.getByLabelText('Last synced')).toHaveTextContent('yesterday');
  });

  it('omits the timestamp element when lastSync is not provided', () => {
    render(<SyncStatusIndicator status="synced" />);

    expect(screen.queryByLabelText('Last synced')).not.toBeInTheDocument();
  });

  it('omits the timestamp element when lastSync is an empty string', () => {
    render(<SyncStatusIndicator status="synced" lastSync="" />);

    expect(screen.queryByLabelText('Last synced')).not.toBeInTheDocument();
  });

  it('renders the error detail in parentheses when status is error', () => {
    render(<SyncStatusIndicator status="error" errorDetail="connection refused" />);

    expect(screen.getByText('(connection refused)')).toBeInTheDocument();
  });

  it('exposes the error detail as both title and aria-label', () => {
    render(<SyncStatusIndicator status="error" errorDetail="boom" />);

    const detail = screen.getByText('(boom)');
    expect(detail).toHaveAttribute('title', 'boom');
    expect(detail).toHaveAttribute('aria-label', 'boom');
  });

  it('does not render error detail when status is not error', () => {
    render(<SyncStatusIndicator status="synced" errorDetail="ignored" />);

    expect(screen.queryByText('(ignored)')).not.toBeInTheDocument();
  });

  it('does not render error detail when status is error but detail is omitted', () => {
    const { container } = render(<SyncStatusIndicator status="error" />);

    expect(container.textContent).toBe('Error');
  });

  it('renders the error detail for a conflict status', () => {
    render(<SyncStatusIndicator status="conflict" errorDetail="hash mismatch" />);

    expect(screen.getByText('(hash mismatch)')).toBeInTheDocument();
  });
});
