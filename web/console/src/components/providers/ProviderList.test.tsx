import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/test/utils';
import { ProviderList } from './ProviderList';

interface Row {
  id: string;
  name: string;
}

const ROWS: Row[] = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
];

function renderList(overrides: Partial<React.ComponentProps<typeof ProviderList<Row>>> = {}) {
  const props = {
    items: ROWS,
    loading: false,
    keyField: (item: Row) => item.id,
    renderContent: (item: Row) => <span>{item.name}</span>,
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    emptyTitle: 'Nothing here',
    emptyDescription: 'Add an item to begin',
    ...overrides,
  } as React.ComponentProps<typeof ProviderList<Row>>;

  render(<ProviderList<Row> {...props} />);
  return props;
}

describe('ProviderList', () => {
  it('shows the loading hint while loading with no items yet', () => {
    renderList({ items: [], loading: true });

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows the empty state title when there are no items and not loading', () => {
    renderList({ items: [], loading: false });

    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('shows the empty state description when there are no items', () => {
    renderList({ items: [], loading: false });

    expect(screen.getByText('Add an item to begin')).toBeInTheDocument();
  });

  it('renders the empty state when loading is true but items already exist (loading overlay path skipped)', () => {
    renderList({ items: ROWS, loading: true });

    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  it('renders content for every item', () => {
    renderList();

    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('renders an Edit and Delete action for each row', () => {
    renderList();

    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
  });

  it('uses the default Delete label when none is supplied', () => {
    renderList();

    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
  });

  it('uses a custom delete label when provided', () => {
    renderList({ deleteLabel: 'Remove' });

    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2);
  });

  it('invokes onEdit with the item and index of the clicked row', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();

    renderList({ onEdit });
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[1]);

    expect(onEdit).toHaveBeenCalledWith(ROWS[1], 1);
  });

  it('invokes onDelete with the item and index of the clicked row', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    renderList({ onDelete });
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

    expect(onDelete).toHaveBeenCalledWith(ROWS[0], 0);
  });

  it('disables the edit and delete actions when actionsDisabled is true', () => {
    renderList({ actionsDisabled: true });

    expect(screen.getAllByRole('button', { name: 'Edit' })[0]).toBeDisabled();
  });

  it('renders extra actions returned by renderExtraActions', () => {
    renderList({
      renderExtraActions: (item) => <span>extra-{item.id}</span>,
    });

    expect(screen.getByText('extra-a')).toBeInTheDocument();
  });

  it('dims a row when getRowDisabled returns true for it', () => {
    renderList({ getRowDisabled: (item) => item.id === 'a' });

    expect(screen.getByText('Alpha').closest('div.item-row')).toHaveStyle({ opacity: '0.6' });
  });

  it('does not dim a row when getRowDisabled returns false for it', () => {
    renderList({ getRowDisabled: () => false });

    expect(screen.getByText('Alpha').closest('div.item-row')).not.toHaveStyle({ opacity: '0.6' });
  });

  it('applies a custom list class name when provided', () => {
    renderList({ listClassName: 'custom-list' });

    expect(document.querySelector('.custom-list')).toBeInTheDocument();
  });
});
