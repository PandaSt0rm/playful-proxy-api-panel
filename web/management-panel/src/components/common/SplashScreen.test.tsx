import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@/test/utils';
import { SplashScreen } from './SplashScreen';

const FADE_OUT_DURATION = 400;

describe('SplashScreen', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the logo image with its alt text', () => {
    render(<SplashScreen onFinish={vi.fn()} />);

    expect(screen.getByAltText('Playful Proxy API Panel')).toBeInTheDocument();
  });

  it('renders the first title line', () => {
    render(<SplashScreen onFinish={vi.fn()} />);

    expect(screen.getByText('Playful Proxy')).toBeInTheDocument();
  });

  it('renders the second title line', () => {
    render(<SplashScreen onFinish={vi.fn()} />);

    expect(screen.getByText('API Panel')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(<SplashScreen onFinish={vi.fn()} />);

    expect(screen.getByText('playful-proxy-api-panel')).toBeInTheDocument();
  });

  it('labels the title heading with the full splash title', () => {
    render(<SplashScreen onFinish={vi.fn()} />);

    expect(screen.getByRole('heading')).toHaveAttribute('aria-label', 'Playful Proxy API Panel');
  });

  it('does not apply the fade-out class by default', () => {
    const { container } = render(<SplashScreen onFinish={vi.fn()} />);

    expect(container.querySelector('.splash-screen')).not.toHaveClass('fade-out');
  });

  it('applies the fade-out class when fadeOut is true', () => {
    const { container } = render(<SplashScreen onFinish={vi.fn()} fadeOut />);

    expect(container.querySelector('.splash-screen')).toHaveClass('fade-out');
  });

  describe('onFinish timing', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('does not call onFinish when fadeOut is false', () => {
      const onFinish = vi.fn();
      render(<SplashScreen onFinish={onFinish} fadeOut={false} />);

      act(() => {
        vi.advanceTimersByTime(FADE_OUT_DURATION * 10);
      });

      expect(onFinish).not.toHaveBeenCalled();
    });

    it('calls onFinish once after the fade-out duration when fadeOut is true', () => {
      const onFinish = vi.fn();
      render(<SplashScreen onFinish={onFinish} fadeOut />);

      act(() => {
        vi.advanceTimersByTime(FADE_OUT_DURATION);
      });

      expect(onFinish).toHaveBeenCalledTimes(1);
    });

    it('does not call onFinish before the fade-out duration elapses', () => {
      const onFinish = vi.fn();
      render(<SplashScreen onFinish={onFinish} fadeOut />);

      act(() => {
        vi.advanceTimersByTime(FADE_OUT_DURATION - 1);
      });

      expect(onFinish).not.toHaveBeenCalled();
    });

    it('does not call onFinish when unmounted before the fade-out duration', () => {
      const onFinish = vi.fn();
      const { unmount } = render(<SplashScreen onFinish={onFinish} fadeOut />);

      unmount();
      act(() => {
        vi.advanceTimersByTime(FADE_OUT_DURATION);
      });

      expect(onFinish).not.toHaveBeenCalled();
    });

    it('cancels the pending finish timer when fadeOut is toggled back to false', () => {
      const onFinish = vi.fn();
      const { rerender } = render(<SplashScreen onFinish={onFinish} fadeOut />);

      rerender(<SplashScreen onFinish={onFinish} fadeOut={false} />);
      act(() => {
        vi.advanceTimersByTime(FADE_OUT_DURATION);
      });

      expect(onFinish).not.toHaveBeenCalled();
    });
  });
});
