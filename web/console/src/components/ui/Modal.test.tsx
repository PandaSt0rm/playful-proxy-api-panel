import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, userEvent, fireEvent } from '@/test/utils';
import { Modal } from './Modal';

const CLOSE_ANIMATION_DURATION = 350;

describe('Modal', () => {
  beforeEach(() => {
    document.body.className = '';
    document.documentElement.className = '';
    document.body.removeAttribute('style');
    document.documentElement.removeAttribute('style');
  });

  it('renders nothing when closed and never previously opened', () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}}>
        body content
      </Modal>
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the dialog with its children when open', () => {
    render(
      <Modal open onClose={() => {}}>
        hello body
      </Modal>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('hello body')).toBeInTheDocument();
  });

  it('renders into a portal on document.body rather than the React root', () => {
    const { container } = render(
      <Modal open onClose={() => {}}>
        body content
      </Modal>
    );

    expect(container.querySelector('.modal-overlay')).toBeNull();
    expect(document.body.querySelector('.modal-overlay')).not.toBeNull();
  });

  it('labels the dialog by its title when a title is provided', () => {
    render(
      <Modal open title="My Title" onClose={() => {}}>
        body
      </Modal>
    );

    expect(screen.getByRole('dialog', { name: 'My Title' })).toBeInTheDocument();
  });

  it('does not set an aria-labelledby when no title is provided', () => {
    render(
      <Modal open onClose={() => {}}>
        body
      </Modal>
    );

    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-labelledby');
  });

  it('marks the dialog as aria-modal', () => {
    render(
      <Modal open onClose={() => {}}>
        body
      </Modal>
    );

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('renders the footer content when provided', () => {
    render(
      <Modal open onClose={() => {}} footer={<span>footer text</span>}>
        body
      </Modal>
    );

    expect(screen.getByText('footer text')).toBeInTheDocument();
  });

  it('applies a numeric width as a pixel style on the modal', () => {
    render(
      <Modal open onClose={() => {}} width={640}>
        body
      </Modal>
    );

    expect(document.body.querySelector('.modal')).toHaveStyle({ width: '640px' });
  });

  it('applies a string width verbatim on the modal', () => {
    render(
      <Modal open onClose={() => {}} width="80%">
        body
      </Modal>
    );

    expect(document.body.querySelector('.modal')).toHaveStyle({ width: '80%' });
  });

  it('applies a custom className to the modal element', () => {
    render(
      <Modal open onClose={() => {}} className="wide-modal">
        body
      </Modal>
    );

    expect(document.body.querySelector('.modal')).toHaveClass('wide-modal');
  });

  it('renders an enabled close button labeled Close by default', () => {
    render(
      <Modal open onClose={() => {}}>
        body
      </Modal>
    );

    expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled();
  });

  describe('scroll lock', () => {
    it('locks the body with the modal-open class while open', () => {
      render(
        <Modal open onClose={() => {}}>
          body
        </Modal>
      );

      expect(document.body).toHaveClass('modal-open');
      expect(document.documentElement).toHaveClass('modal-open');
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('releases the body lock after the modal fully unmounts', async () => {
      const { unmount } = render(
        <Modal open onClose={() => {}}>
          body
        </Modal>
      );

      unmount();

      await waitFor(() => expect(document.body).not.toHaveClass('modal-open'));
      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('closing behaviour', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('invokes onClose after a clicked close, once the animation duration elapses', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      render(
        <Modal open onClose={onClose}>
          body
        </Modal>
      );
      await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus());

      await user.click(screen.getByRole('button', { name: 'Close' }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it('does not invoke onClose until the close animation duration has elapsed', () => {
      vi.useFakeTimers();
      const onClose = vi.fn();
      render(
        <Modal open onClose={onClose}>
          body
        </Modal>
      );
      vi.advanceTimersByTime(0);

      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      vi.advanceTimersByTime(CLOSE_ANIMATION_DURATION - 1);

      expect(onClose).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('coalesces repeated close requests into a single onClose call', () => {
      vi.useFakeTimers();
      const onClose = vi.fn();
      render(
        <Modal open onClose={onClose}>
          body
        </Modal>
      );
      vi.advanceTimersByTime(0);

      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      vi.advanceTimersByTime(CLOSE_ANIMATION_DURATION);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Escape handling', () => {
    it('requests close when Escape is pressed', async () => {
      const onClose = vi.fn();
      render(
        <Modal open onClose={onClose}>
          body
        </Modal>
      );
      await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus());

      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it('ignores Escape when closeDisabled is true', async () => {
      const onClose = vi.fn();
      render(
        <Modal open onClose={onClose} closeDisabled>
          <input aria-label="field" />
        </Modal>
      );
      await waitFor(() => expect(screen.getByLabelText('field')).toHaveFocus());

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('closeDisabled', () => {
    it('renders the close button as disabled', () => {
      render(
        <Modal open onClose={() => {}} closeDisabled>
          body
        </Modal>
      );

      expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    });

    it('does not call onClose when the disabled close button is clicked', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      render(
        <Modal open onClose={onClose} closeDisabled>
          body
        </Modal>
      );

      await user.click(screen.getByRole('button', { name: 'Close' }));

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('focus management', () => {
    it('moves focus to the close button when it is the first focusable element', async () => {
      render(
        <Modal open onClose={() => {}}>
          plain text
        </Modal>
      );

      await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus());
    });
  });

  describe('focus trap', () => {
    it('wraps focus from the last focusable element back to the close button on Tab', async () => {
      const user = userEvent.setup();
      render(
        <Modal open onClose={() => {}}>
          <input aria-label="only field" />
        </Modal>
      );
      await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus());

      screen.getByLabelText('only field').focus();
      await user.keyboard('{Tab}');

      expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    });

    it('wraps focus from the close button back to the last focusable element on Shift+Tab', async () => {
      const user = userEvent.setup();
      render(
        <Modal open onClose={() => {}}>
          <input aria-label="only field" />
        </Modal>
      );
      await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus());

      await user.keyboard('{Shift>}{Tab}{/Shift}');

      expect(screen.getByLabelText('only field')).toHaveFocus();
    });

    it('redirects Tab to the modal when there is no focusable content at all', async () => {
      render(
        <Modal open closeDisabled onClose={() => {}}>
          plain text
        </Modal>
      );
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

      fireEvent.keyDown(document, { key: 'Tab' });

      expect(screen.getByRole('dialog')).toHaveFocus();
    });
  });

  describe('focus restoration', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('restores focus to the previously focused element after the modal closes', async () => {
      vi.useFakeTimers();
      const trigger = document.createElement('button');
      trigger.textContent = 'opener';
      document.body.appendChild(trigger);
      trigger.focus();

      const { rerender } = render(
        <Modal open onClose={() => {}}>
          <input aria-label="field" />
        </Modal>
      );
      vi.advanceTimersByTime(0);

      rerender(
        <Modal open={false} onClose={() => {}}>
          <input aria-label="field" />
        </Modal>
      );
      vi.advanceTimersByTime(CLOSE_ANIMATION_DURATION);

      expect(trigger).toHaveFocus();

      trigger.remove();
    });
  });
});
