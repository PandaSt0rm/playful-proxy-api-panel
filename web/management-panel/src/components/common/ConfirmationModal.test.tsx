import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import { ConfirmationModal } from './ConfirmationModal';
import { useNotificationStore } from '@/stores';

const initialConfirmation = { isOpen: false, isLoading: false, options: null };

const resetStore = () => {
  useNotificationStore.setState({
    notifications: [],
    confirmation: { ...initialConfirmation },
  });
};

describe('ConfirmationModal', () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
  });

  it('renders nothing when the confirmation dialog is closed', () => {
    const { container } = render(<ConfirmationModal />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when open but options are missing', () => {
    useNotificationStore.setState({
      confirmation: { isOpen: true, isLoading: false, options: null },
    });

    const { container } = render(<ConfirmationModal />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the provided message when the dialog is open', () => {
    useNotificationStore.getState().showConfirmation({
      message: 'Delete this provider?',
      onConfirm: vi.fn(),
    });

    render(<ConfirmationModal />);

    expect(screen.getByText('Delete this provider?')).toBeInTheDocument();
  });

  it('renders the provided title when the dialog is open', () => {
    useNotificationStore.getState().showConfirmation({
      title: 'Confirm deletion',
      message: 'Are you sure?',
      onConfirm: vi.fn(),
    });

    render(<ConfirmationModal />);

    expect(screen.getByText('Confirm deletion')).toBeInTheDocument();
  });

  it('renders a ReactNode message inside a div rather than a paragraph', () => {
    useNotificationStore.getState().showConfirmation({
      message: <strong data-testid="rich-message">Rich content</strong>,
      onConfirm: vi.fn(),
    });

    render(<ConfirmationModal />);

    expect(screen.getByTestId('rich-message')).toBeInTheDocument();
  });

  it('uses the default Confirm label when confirmText is omitted', () => {
    useNotificationStore.getState().showConfirmation({
      message: 'Proceed?',
      onConfirm: vi.fn(),
    });

    render(<ConfirmationModal />);

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('uses the default Cancel label when cancelText is omitted', () => {
    useNotificationStore.getState().showConfirmation({
      message: 'Proceed?',
      onConfirm: vi.fn(),
    });

    render(<ConfirmationModal />);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('renders the custom confirm label when confirmText is provided', () => {
    useNotificationStore.getState().showConfirmation({
      message: 'Proceed?',
      confirmText: 'Yes, delete it',
      onConfirm: vi.fn(),
    });

    render(<ConfirmationModal />);

    expect(screen.getByRole('button', { name: 'Yes, delete it' })).toBeInTheDocument();
  });

  it('renders the custom cancel label when cancelText is provided', () => {
    useNotificationStore.getState().showConfirmation({
      message: 'Proceed?',
      cancelText: 'No, keep it',
      onConfirm: vi.fn(),
    });

    render(<ConfirmationModal />);

    expect(screen.getByRole('button', { name: 'No, keep it' })).toBeInTheDocument();
  });

  it('invokes onConfirm exactly once when the confirm button is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    useNotificationStore.getState().showConfirmation({ message: 'Proceed?', onConfirm });

    render(<ConfirmationModal />);
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it('closes the dialog in the store after a successful confirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    useNotificationStore.getState().showConfirmation({ message: 'Proceed?', onConfirm });

    render(<ConfirmationModal />);
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(useNotificationStore.getState().confirmation.isOpen).toBe(false));
  });

  it('awaits an async onConfirm before closing the dialog', async () => {
    const user = userEvent.setup();
    let resolveConfirm: (() => void) | undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        })
    );
    useNotificationStore.getState().showConfirmation({ message: 'Proceed?', onConfirm });

    render(<ConfirmationModal />);
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(useNotificationStore.getState().confirmation.isOpen).toBe(true);

    resolveConfirm?.();
    await waitFor(() => expect(useNotificationStore.getState().confirmation.isOpen).toBe(false));
  });

  it('keeps the dialog open when onConfirm rejects', async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onConfirm = vi.fn().mockRejectedValue(new Error('save failed'));
    useNotificationStore.getState().showConfirmation({ message: 'Proceed?', onConfirm });

    render(<ConfirmationModal />);
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(useNotificationStore.getState().confirmation.isOpen).toBe(true);

    consoleError.mockRestore();
  });

  it('resets the loading flag to false after onConfirm rejects', async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onConfirm = vi.fn().mockRejectedValue(new Error('save failed'));
    useNotificationStore.getState().showConfirmation({ message: 'Proceed?', onConfirm });

    render(<ConfirmationModal />);
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(useNotificationStore.getState().confirmation.isLoading).toBe(false));
    consoleError.mockRestore();
  });

  it('invokes onCancel when the cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    useNotificationStore
      .getState()
      .showConfirmation({ message: 'Proceed?', onConfirm: vi.fn(), onCancel });

    render(<ConfirmationModal />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('closes the dialog in the store when the cancel button is clicked', async () => {
    const user = userEvent.setup();
    useNotificationStore.getState().showConfirmation({ message: 'Proceed?', onConfirm: vi.fn() });

    render(<ConfirmationModal />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(useNotificationStore.getState().confirmation.isOpen).toBe(false));
  });

  it('does not require onCancel to close the dialog on cancel', async () => {
    const user = userEvent.setup();
    useNotificationStore.getState().showConfirmation({ message: 'Proceed?', onConfirm: vi.fn() });

    render(<ConfirmationModal />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(useNotificationStore.getState().confirmation.isOpen).toBe(false));
  });

  it('disables the cancel button while the confirmation is loading', () => {
    useNotificationStore.setState({
      confirmation: {
        isOpen: true,
        isLoading: true,
        options: { message: 'Proceed?', onConfirm: vi.fn() },
      },
    });

    render(<ConfirmationModal />);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('disables the confirm button while the confirmation is loading', () => {
    useNotificationStore.setState({
      confirmation: {
        isOpen: true,
        isLoading: true,
        options: { message: 'Proceed?', onConfirm: vi.fn() },
      },
    });

    render(<ConfirmationModal />);

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });

  it('does not invoke onCancel when cancel is clicked while loading', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    useNotificationStore.setState({
      confirmation: {
        isOpen: true,
        isLoading: true,
        options: { message: 'Proceed?', onConfirm: vi.fn(), onCancel },
      },
    });

    render(<ConfirmationModal />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).not.toHaveBeenCalled();
  });
});
