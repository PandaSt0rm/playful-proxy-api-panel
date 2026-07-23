import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import { NotificationContainer } from './NotificationContainer';
import { useNotificationStore } from '@/stores';
import type { Notification } from '@/types';

const ANIMATION_DURATION = 300;

const initialConfirmation = { isOpen: false, isLoading: false, options: null };

const seedNotifications = (notifications: Notification[]) => {
  useNotificationStore.setState({ notifications });
};

const resetStore = () => {
  useNotificationStore.setState({
    notifications: [],
    confirmation: { ...initialConfirmation },
  });
};

describe('NotificationContainer', () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
  });

  it('renders nothing when there are no notifications', () => {
    const { container } = render(<NotificationContainer />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the message text of a queued notification', () => {
    seedNotifications([{ id: 'n1', message: 'Saved successfully', type: 'success', duration: 0 }]);

    render(<NotificationContainer />);

    expect(screen.getByText('Saved successfully')).toBeInTheDocument();
  });

  it('renders one entry per queued notification', () => {
    seedNotifications([
      { id: 'n1', message: 'first', type: 'info', duration: 0 },
      { id: 'n2', message: 'second', type: 'info', duration: 0 },
    ]);

    const { container } = render(<NotificationContainer />);

    expect(container.querySelectorAll('.notification')).toHaveLength(2);
  });

  it('applies the notification type as a CSS class', () => {
    const { container } = render(<NotificationContainer />);

    act(() => {
      seedNotifications([{ id: 'n1', message: 'Boom', type: 'error', duration: 0 }]);
    });

    expect(container.querySelector('.notification')).toHaveClass('notification', 'error');
  });

  it('applies the entering class to a notification on first render', () => {
    const { container } = render(<NotificationContainer />);

    act(() => {
      seedNotifications([{ id: 'n1', message: 'Hello', type: 'info', duration: 0 }]);
    });

    expect(container.querySelector('.notification')).toHaveClass('entering');
  });

  it('renders a close button labelled Close for each notification', () => {
    seedNotifications([{ id: 'n1', message: 'Hello', type: 'info', duration: 0 }]);

    render(<NotificationContainer />);

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('marks a notification as exiting immediately when its close button is clicked', async () => {
    const user = userEvent.setup();
    seedNotifications([{ id: 'n1', message: 'Hello', type: 'info', duration: 0 }]);

    const { container } = render(<NotificationContainer />);
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(container.querySelector('.notification')).toHaveClass('exiting');
  });

  describe('close-button removal timing', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('removes the notification from the store after the animation duration', () => {
      render(<NotificationContainer />);
      act(() => {
        seedNotifications([{ id: 'n1', message: 'Hello', type: 'info', duration: 0 }]);
      });

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      });
      act(() => {
        vi.advanceTimersByTime(ANIMATION_DURATION);
      });

      expect(useNotificationStore.getState().notifications).toHaveLength(0);
    });

    it('keeps the notification in the store before the animation duration elapses', () => {
      render(<NotificationContainer />);
      act(() => {
        seedNotifications([{ id: 'n1', message: 'Hello', type: 'info', duration: 0 }]);
      });

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      });
      act(() => {
        vi.advanceTimersByTime(ANIMATION_DURATION - 1);
      });

      expect(useNotificationStore.getState().notifications).toHaveLength(1);
    });
  });

  describe('store-driven removal animation', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('marks a notification as exiting when removed from the store', () => {
      const { container } = render(<NotificationContainer />);
      act(() => {
        seedNotifications([{ id: 'n1', message: 'Hello', type: 'info', duration: 0 }]);
      });

      act(() => {
        useNotificationStore.getState().removeNotification('n1');
      });

      expect(container.querySelector('.notification')).toHaveClass('exiting');
    });

    it('unmounts the exiting notification after the animation duration elapses', () => {
      const { container } = render(<NotificationContainer />);
      act(() => {
        seedNotifications([{ id: 'n1', message: 'Hello', type: 'info', duration: 0 }]);
      });
      act(() => {
        useNotificationStore.getState().removeNotification('n1');
      });

      act(() => {
        vi.advanceTimersByTime(ANIMATION_DURATION);
      });

      expect(container.querySelector('.notification')).toBeNull();
    });

    it('still renders the exiting notification just before the animation duration elapses', () => {
      const { container } = render(<NotificationContainer />);
      act(() => {
        seedNotifications([{ id: 'n1', message: 'Hello', type: 'info', duration: 0 }]);
      });
      act(() => {
        useNotificationStore.getState().removeNotification('n1');
      });

      act(() => {
        vi.advanceTimersByTime(ANIMATION_DURATION - 1);
      });

      expect(container.querySelector('.notification')).not.toBeNull();
    });

    it('leaves the surviving notification mounted when only one of two is removed', () => {
      render(<NotificationContainer />);
      act(() => {
        seedNotifications([
          { id: 'n1', message: 'first', type: 'info', duration: 0 },
          { id: 'n2', message: 'second', type: 'info', duration: 0 },
        ]);
      });
      act(() => {
        useNotificationStore.getState().removeNotification('n1');
      });

      act(() => {
        vi.advanceTimersByTime(ANIMATION_DURATION);
      });

      expect(screen.getByText('second')).toBeInTheDocument();
    });
  });

  it('shows a newly added notification alongside the existing one', async () => {
    const { container } = render(<NotificationContainer />);
    act(() => {
      seedNotifications([{ id: 'n1', message: 'first', type: 'info', duration: 0 }]);
    });

    act(() => {
      seedNotifications([
        { id: 'n1', message: 'first', type: 'info', duration: 0 },
        { id: 'n2', message: 'second', type: 'info', duration: 0 },
      ]);
    });

    await waitFor(() => expect(container.querySelectorAll('.notification')).toHaveLength(2));
  });
  it('revives an exiting id without duplicating it and leaves sibling close state unchanged', () => {
    vi.useFakeTimers();
    const { container } = render(<NotificationContainer />);
    act(() => {
      seedNotifications([
        { id: 'n1', message: 'first', type: 'info', duration: 0 },
        { id: 'n2', message: 'second', type: 'info', duration: 0 },
      ]);
    });
    act(() => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
    });
    expect(container.querySelectorAll('.notification')).toHaveLength(2);
    expect(screen.getByText('first').closest('.notification')).toHaveClass('exiting');
    expect(screen.getByText('second').closest('.notification')).toHaveClass('entering');

    act(() => {
      seedNotifications([{ id: 'n2', message: 'second', type: 'info', duration: 0 }]);
    });
    act(() => {
      seedNotifications([
        { id: 'n1', message: 'first again', type: 'info', duration: 0 },
        { id: 'n2', message: 'second', type: 'info', duration: 0 },
      ]);
    });
    expect(container.querySelectorAll('.notification')).toHaveLength(2);
    vi.useRealTimers();
  });
});
