import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useNotificationStore } from './useNotificationStore';
import { NOTIFICATION_DURATION_MS } from '@/utils/constants';

const initialConfirmation = { isOpen: false, isLoading: false, options: null };

describe('useNotificationStore', () => {
  beforeEach(() => {
    useNotificationStore.setState({
      notifications: [],
      confirmation: { ...initialConfirmation },
    });
  });

  describe('showNotification', () => {
    it('appends a notification with the given message', () => {
      useNotificationStore.getState().showNotification('Saved successfully');

      const { notifications } = useNotificationStore.getState();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].message).toBe('Saved successfully');
    });

    it('defaults the type to info when no type is provided', () => {
      useNotificationStore.getState().showNotification('Heads up');

      expect(useNotificationStore.getState().notifications[0].type).toBe('info');
    });

    it('defaults the duration to NOTIFICATION_DURATION_MS when omitted', () => {
      useNotificationStore.getState().showNotification('Heads up');

      expect(useNotificationStore.getState().notifications[0].duration).toBe(NOTIFICATION_DURATION_MS);
    });

    it('stores the explicit type when provided', () => {
      useNotificationStore.getState().showNotification('Boom', 'error');

      expect(useNotificationStore.getState().notifications[0].type).toBe('error');
    });

    it('preserves insertion order when multiple notifications are queued', () => {
      const store = useNotificationStore.getState();
      store.showNotification('first');
      store.showNotification('second');

      const messages = useNotificationStore.getState().notifications.map((n) => n.message);
      expect(messages).toEqual(['first', 'second']);
    });

    it('assigns a distinct id to each queued notification', () => {
      const randomSpy = vi
        .spyOn(Math, 'random')
        .mockReturnValueOnce(0.111111111)
        .mockReturnValueOnce(0.222222222);
      const store = useNotificationStore.getState();
      store.showNotification('first');
      store.showNotification('second');

      const [first, second] = useNotificationStore.getState().notifications;
      expect(first.id).not.toBe(second.id);

      randomSpy.mockRestore();
    });
  });

  describe('showNotification auto-removal', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('removes the notification after its duration elapses', () => {
      useNotificationStore.getState().showNotification('temporary', 'info', 1000);

      vi.advanceTimersByTime(1000);

      expect(useNotificationStore.getState().notifications).toHaveLength(0);
    });

    it('keeps the notification before its duration elapses', () => {
      useNotificationStore.getState().showNotification('temporary', 'info', 1000);

      vi.advanceTimersByTime(999);

      expect(useNotificationStore.getState().notifications).toHaveLength(1);
    });

    it('never auto-removes a notification with a zero duration', () => {
      useNotificationStore.getState().showNotification('sticky', 'info', 0);

      vi.advanceTimersByTime(100000);

      expect(useNotificationStore.getState().notifications).toHaveLength(1);
    });

    it('never auto-removes a notification with a negative duration', () => {
      useNotificationStore.getState().showNotification('sticky', 'info', -500);

      vi.advanceTimersByTime(100000);

      expect(useNotificationStore.getState().notifications).toHaveLength(1);
    });

    it('only removes the expired notification and leaves others queued', () => {
      const store = useNotificationStore.getState();
      store.showNotification('short', 'info', 1000);
      store.showNotification('long', 'info', 5000);

      vi.advanceTimersByTime(1000);

      const messages = useNotificationStore.getState().notifications.map((n) => n.message);
      expect(messages).toEqual(['long']);
    });
  });

  describe('removeNotification', () => {
    it('removes the notification matching the given id', () => {
      useNotificationStore.getState().showNotification('keep me', 'info', 0);
      const targetId = useNotificationStore.getState().notifications[0].id;

      useNotificationStore.getState().removeNotification(targetId);

      expect(useNotificationStore.getState().notifications).toHaveLength(0);
    });

    it('leaves the queue unchanged when the id does not match', () => {
      useNotificationStore.getState().showNotification('keep me', 'info', 0);

      useNotificationStore.getState().removeNotification('non-existent-id');

      expect(useNotificationStore.getState().notifications).toHaveLength(1);
    });
  });

  describe('clearAll', () => {
    it('empties the notification queue', () => {
      const store = useNotificationStore.getState();
      store.showNotification('a', 'info', 0);
      store.showNotification('b', 'info', 0);

      useNotificationStore.getState().clearAll();

      expect(useNotificationStore.getState().notifications).toEqual([]);
    });
  });

  describe('showConfirmation', () => {
    it('opens the confirmation dialog with the provided options', () => {
      const onConfirm = vi.fn();
      const options = { message: 'Delete this?', onConfirm };

      useNotificationStore.getState().showConfirmation(options);

      const { confirmation } = useNotificationStore.getState();
      expect(confirmation.isOpen).toBe(true);
      expect(confirmation.options).toBe(options);
    });

    it('resets the loading flag to false when opening', () => {
      useNotificationStore.setState({
        confirmation: { isOpen: false, isLoading: true, options: null },
      });

      useNotificationStore.getState().showConfirmation({ message: 'x', onConfirm: vi.fn() });

      expect(useNotificationStore.getState().confirmation.isLoading).toBe(false);
    });
  });

  describe('hideConfirmation', () => {
    it('closes the dialog and clears the stored options', () => {
      useNotificationStore.getState().showConfirmation({ message: 'x', onConfirm: vi.fn() });

      useNotificationStore.getState().hideConfirmation();

      const { confirmation } = useNotificationStore.getState();
      expect(confirmation.isOpen).toBe(false);
      expect(confirmation.options).toBeNull();
    });

    it('preserves the loading flag when hiding', () => {
      useNotificationStore.setState({
        confirmation: { isOpen: true, isLoading: true, options: { message: 'x', onConfirm: vi.fn() } },
      });

      useNotificationStore.getState().hideConfirmation();

      expect(useNotificationStore.getState().confirmation.isLoading).toBe(true);
    });
  });

  describe('setConfirmationLoading', () => {
    it('sets the loading flag to true', () => {
      useNotificationStore.getState().setConfirmationLoading(true);

      expect(useNotificationStore.getState().confirmation.isLoading).toBe(true);
    });

    it('sets the loading flag to false', () => {
      useNotificationStore.setState({
        confirmation: { isOpen: true, isLoading: true, options: null },
      });

      useNotificationStore.getState().setConfirmationLoading(false);

      expect(useNotificationStore.getState().confirmation.isLoading).toBe(false);
    });

    it('preserves isOpen and options while toggling loading', () => {
      const options = { message: 'x', onConfirm: vi.fn() };
      useNotificationStore.setState({
        confirmation: { isOpen: true, isLoading: false, options },
      });

      useNotificationStore.getState().setConfirmationLoading(true);

      const { confirmation } = useNotificationStore.getState();
      expect(confirmation.isOpen).toBe(true);
      expect(confirmation.options).toBe(options);
    });
  });
});
